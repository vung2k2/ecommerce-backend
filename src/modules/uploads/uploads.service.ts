import { randomUUID } from 'node:crypto';
import { ERROR_CODES, type UploadPurpose } from '../../constants/index.js';
import { s3Service } from '../../services/s3.service.js';
import { AppError } from '../../utils/app-error.js';
import { MIME_EXTENSION_MAP, UPLOAD_POLICIES } from './uploads.policy.js';

export interface ImageFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export interface StoredImage {
  fileKey: string;
  fileUrl: string;
}

function hasImageSignature(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  if (mimeType === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((value, index) => buffer[index] === value);
  }

  if (mimeType === 'image/webp') {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }

  return false;
}

export const uploadsService = {
  async storeImage(file: ImageFile, purpose: UploadPurpose, ownerId: string): Promise<StoredImage> {
    const policy = UPLOAD_POLICIES[purpose];
    const mimeType = file.mimetype.toLowerCase().trim();

    if (!policy.allowedMimeTypes.includes(mimeType) || !hasImageSignature(file.buffer, mimeType)) {
      throw new AppError(422, ERROR_CODES.INVALID_FILE_TYPE);
    }

    if (file.size <= 0 || file.size > policy.maxSizeBytes) {
      throw new AppError(422, ERROR_CODES.FILE_SIZE_EXCEEDED);
    }

    const extension = MIME_EXTENSION_MAP[mimeType as keyof typeof MIME_EXTENSION_MAP];
    if (!extension) {
      throw new AppError(422, ERROR_CODES.INVALID_FILE_TYPE);
    }

    const uploadId = randomUUID();
    const tempKey = `temp/${policy.folder}/${ownerId}/${uploadId}${extension}`;
    const fileKey = `${policy.folder}/${uploadId}${extension}`;

    try {
      await s3Service.putObject(tempKey, file.buffer, mimeType);
      await s3Service.copyObject(tempKey, fileKey);
    } catch (error) {
      await s3Service.cleanupObjects([tempKey, fileKey]);
      throw error;
    }

    await s3Service.cleanupObjects([tempKey]);
    return { fileKey, fileUrl: s3Service.getPublicUrl(fileKey) };
  },
};
