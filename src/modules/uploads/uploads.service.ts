import { randomUUID } from 'node:crypto';
import { ERROR_CODES, ROLES } from '../../constants/index.js';
import { s3Service, type PresignedUploadResult } from '../../services/s3.service.js';
import { AppError } from '../../utils/app-error.js';
import type { AccessTokenPayload } from '../../utils/jwt.js';
import { MIME_EXTENSION_MAP, UPLOAD_POLICIES } from './uploads.policy.js';
import { uploadsRepository } from './uploads.repository.js';
import type { PresignUploadDto } from './uploads.schema.js';

export interface GeneratePresignedUrlInput {
  user: AccessTokenPayload;
  dto: PresignUploadDto;
}

export class UploadsService {
  async generatePresignedUploadUrl(
    input: GeneratePresignedUrlInput,
  ): Promise<PresignedUploadResult> {
    const { user, dto } = input;
    const policy = UPLOAD_POLICIES[dto.purpose];

    if (!policy) {
      throw new AppError(400, ERROR_CODES.UNSUPPORTED_UPLOAD_PURPOSE);
    }

    const dbUser = await uploadsRepository.findActorById(user.userId);

    if (!dbUser || !dbUser.isActive) {
      throw new AppError(403, ERROR_CODES.INACTIVE_ACCOUNT);
    }

    if (policy.requiredPermission) {
      if (dbUser.role === ROLES.CUSTOMER) {
        throw new AppError(403, ERROR_CODES.FORBIDDEN);
      }

      if (dbUser.role === ROLES.STAFF) {
        const hasPermission = dbUser.permissions.some(
          (item) => item.permission === policy.requiredPermission,
        );
        if (!hasPermission) {
          throw new AppError(403, ERROR_CODES.FORBIDDEN);
        }
      }
    }

    const normalizedMimeType = dto.mimeType.toLowerCase().trim();
    if (!policy.allowedMimeTypes.includes(normalizedMimeType)) {
      throw new AppError(422, ERROR_CODES.INVALID_FILE_TYPE);
    }

    if (dto.fileSize > policy.maxSizeBytes) {
      throw new AppError(422, ERROR_CODES.FILE_SIZE_EXCEEDED);
    }

    const extension = MIME_EXTENSION_MAP[normalizedMimeType as keyof typeof MIME_EXTENSION_MAP];
    if (!extension) {
      throw new AppError(422, ERROR_CODES.INVALID_FILE_TYPE);
    }

    const fileKey = `temp/${policy.folder}/${dbUser.id}/${randomUUID()}${extension}`;

    return s3Service.generatePresignedUploadUrl({
      key: fileKey,
      mimeType: normalizedMimeType,
      fileSize: dto.fileSize,
      expiresInSeconds: 600,
    });
  }
}

export const uploadsService = new UploadsService();
