import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

const MAX_DELETE_BATCH_SIZE = 1000;
const CLEANUP_ATTEMPTS = 3;

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

  async putObject(key: string, body: Uint8Array, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async copyObject(sourceKey: string, destinationKey: string): Promise<void> {
    const copySource = `${this.bucket}/${encodeURIComponent(sourceKey).replace(/%2F/g, '/')}`;
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: copySource,
        Key: destinationKey,
      }),
    );
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
