import { randomUUID } from 'node:crypto';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import { ERROR_CODES } from '../constants/index.js';
import { AppError } from '../utils/app-error.js';

const MAX_DELETE_BATCH_SIZE = 1000;
const CLEANUP_ATTEMPTS = 3;

export interface GeneratePresignedUrlParams {
  key: string;
  mimeType: string;
  fileSize: number;
  expiresInSeconds?: number;
}

export interface PresignedUploadResult {
  uploadUrl: string;
  fileKey: string;
  fileUrl: string;
  expiresInSeconds: number;
}

export interface PromoteTempUploadParams {
  url: string;
  expectedFolder: string;
  ownerId: string;
  allowedMimeTypes: readonly string[];
  maxSizeBytes: number;
}

export interface PromotedUploadResult {
  fileUrl: string;
  fileKey: string;
  tempKey: string;
}

export interface ObjectMetadata {
  contentLength: number;
  contentType: string;
  eTag: string;
}

function isNotFoundError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;

  const candidate = error as {
    name?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };

  return candidate.name === 'NotFound' || candidate.$metadata?.httpStatusCode === 404;
}

function hasImageSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  if (mimeType === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((value, index) => bytes[index] === value);
  }

  if (mimeType === 'image/webp') {
    const riff = String.fromCharCode(...bytes.slice(0, 4));
    const webp = String.fromCharCode(...bytes.slice(8, 12));
    return bytes.length >= 12 && riff === 'RIFF' && webp === 'WEBP';
  }

  return false;
}

function extensionForMimeType(mimeType: string): string | null {
  switch (mimeType) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    default:
      return null;
  }
}

export class S3Service {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    this.bucket = env.AWS_S3_BUCKET_NAME;

    const s3Config: {
      region: string;
      credentials?: { accessKeyId: string; secretAccessKey: string };
      endpoint?: string;
      forcePathStyle?: boolean;
    } = {
      region: env.AWS_REGION,
    };

    if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
      s3Config.credentials = {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      };
    }

    if (env.AWS_S3_ENDPOINT) {
      s3Config.endpoint = env.AWS_S3_ENDPOINT;
      s3Config.forcePathStyle = true;
    }

    this.client = new S3Client(s3Config);
  }

  getPublicUrl(key: string): string {
    if (env.AWS_S3_PUBLIC_DOMAIN) {
      const baseUrl = env.AWS_S3_PUBLIC_DOMAIN.replace(/\/+$/, '');
      return `${baseUrl}/${key}`;
    }

    if (env.AWS_S3_ENDPOINT) {
      const endpoint = env.AWS_S3_ENDPOINT.replace(/\/+$/, '');
      return `${endpoint}/${this.bucket}/${key}`;
    }

    return `https://${this.bucket}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;
  }

  extractKeyFromUrl(url: string): string | null {
    if (!url || typeof url !== 'string') return null;

    try {
      const parsed = new URL(url);

      if (env.AWS_S3_PUBLIC_DOMAIN) {
        const publicDomain = new URL(env.AWS_S3_PUBLIC_DOMAIN);
        if (parsed.origin === publicDomain.origin) {
          const basePath = publicDomain.pathname.replace(/^\/+|\/+$/g, '');
          let pathname = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');

          if (basePath) {
            if (!pathname.startsWith(`${basePath}/`)) return null;
            pathname = pathname.slice(basePath.length + 1);
          }

          return pathname.length > 0 ? pathname : null;
        }
      }

      if (env.AWS_S3_ENDPOINT) {
        const endpoint = new URL(env.AWS_S3_ENDPOINT);
        if (parsed.origin === endpoint.origin) {
          let key = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
          if (key.startsWith(`${this.bucket}/`)) {
            key = key.slice(this.bucket.length + 1);
          }
          return key.length > 0 ? key : null;
        }
      }

      const validHostnames = [
        `${this.bucket}.s3.${env.AWS_REGION}.amazonaws.com`,
        `${this.bucket}.s3.amazonaws.com`,
        `s3.${env.AWS_REGION}.amazonaws.com`,
        's3.amazonaws.com',
      ];

      if (validHostnames.includes(parsed.hostname)) {
        let key = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
        if (key.startsWith(`${this.bucket}/`)) {
          key = key.slice(this.bucket.length + 1);
        }
        return key.length > 0 ? key : null;
      }

      return null;
    } catch {
      return null;
    }
  }

  async generatePresignedUploadUrl(
    params: GeneratePresignedUrlParams,
  ): Promise<PresignedUploadResult> {
    const expiresInSeconds = params.expiresInSeconds ?? 600;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
      ContentType: params.mimeType,
    });

    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
    });

    return {
      uploadUrl,
      fileKey: params.key,
      fileUrl: this.getPublicUrl(params.key),
      expiresInSeconds,
    };
  }

  async getObjectMetadata(key: string): Promise<ObjectMetadata> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );

      if (result.ContentLength === undefined || !result.ContentType || !result.ETag) {
        throw new AppError(422, ERROR_CODES.INVALID_IMAGE_URL);
      }

      return {
        contentLength: result.ContentLength,
        contentType: result.ContentType.split(';', 1)[0]?.trim().toLowerCase() ?? '',
        eTag: result.ETag,
      };
    } catch (error) {
      if (isNotFoundError(error)) {
        throw new AppError(422, ERROR_CODES.INVALID_IMAGE_URL);
      }
      throw error;
    }
  }

  async getObjectSignature(key: string): Promise<Uint8Array> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Range: 'bytes=0-15',
        }),
      );

      if (!result.Body) {
        throw new AppError(422, ERROR_CODES.INVALID_IMAGE_URL);
      }

      return result.Body.transformToByteArray();
    } catch (error) {
      if (isNotFoundError(error)) {
        throw new AppError(422, ERROR_CODES.INVALID_IMAGE_URL);
      }
      throw error;
    }
  }

  async copyObject(sourceKey: string, destinationKey: string, sourceETag: string): Promise<void> {
    const copySource = `${this.bucket}/${encodeURIComponent(sourceKey).replace(/%2F/g, '/')}`;
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: copySource,
        CopySourceIfMatch: sourceETag,
        Key: destinationKey,
      }),
    );
  }

  async promoteTempUpload(params: PromoteTempUploadParams): Promise<PromotedUploadResult> {
    const tempKey = this.extractKeyFromUrl(params.url);
    const ownerPrefix = `temp/${params.expectedFolder}/${params.ownerId}/`;

    if (!tempKey || !tempKey.startsWith(ownerPrefix)) {
      throw new AppError(422, ERROR_CODES.INVALID_IMAGE_URL);
    }

    const fileName = tempKey.slice(ownerPrefix.length);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/.test(fileName)) {
      throw new AppError(422, ERROR_CODES.INVALID_IMAGE_URL);
    }

    const metadata = await this.getObjectMetadata(tempKey);
    if (!params.allowedMimeTypes.includes(metadata.contentType)) {
      throw new AppError(422, ERROR_CODES.INVALID_FILE_TYPE);
    }

    if (metadata.contentLength <= 0 || metadata.contentLength > params.maxSizeBytes) {
      throw new AppError(422, ERROR_CODES.FILE_SIZE_EXCEEDED);
    }

    const signature = await this.getObjectSignature(tempKey);
    if (!hasImageSignature(signature, metadata.contentType)) {
      throw new AppError(422, ERROR_CODES.INVALID_FILE_TYPE);
    }

    const extension = extensionForMimeType(metadata.contentType);
    if (!extension) {
      throw new AppError(422, ERROR_CODES.INVALID_FILE_TYPE);
    }

    const fileKey = `${params.expectedFolder}/${randomUUID()}${extension}`;
    await this.copyObject(tempKey, fileKey, metadata.eTag);

    return {
      fileUrl: this.getPublicUrl(fileKey),
      fileKey,
      tempKey,
    };
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async deleteObjects(keys: string[]): Promise<void> {
    const validKeys = [...new Set(keys.filter(Boolean))];

    for (let index = 0; index < validKeys.length; index += MAX_DELETE_BATCH_SIZE) {
      const batch = validKeys.slice(index, index + MAX_DELETE_BATCH_SIZE);
      const result = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Objects: batch.map((key) => ({ Key: key })),
            Quiet: true,
          },
        }),
      );

      if (result.Errors && result.Errors.length > 0) {
        throw new Error('S3 failed to delete one or more objects');
      }
    }
  }

  async cleanupObjects(keys: string[]): Promise<void> {
    const validKeys = [...new Set(keys.filter(Boolean))];
    if (validKeys.length === 0) return;

    for (let attempt = 1; attempt <= CLEANUP_ATTEMPTS; attempt += 1) {
      try {
        await this.deleteObjects(validKeys);
        return;
      } catch (error) {
        if (attempt === CLEANUP_ATTEMPTS) {
          logger.error({ error, keys: validKeys }, 'S3 object cleanup failed');
          return;
        }

        await new Promise<void>((resolve) => {
          setTimeout(resolve, attempt * 100);
        });
      }
    }
  }
}

export const s3Service = new S3Service();
