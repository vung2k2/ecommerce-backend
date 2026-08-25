import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../src/constants/index.js';
import { s3Service } from '../src/services/s3.service.js';

const ownerId = '11111111-1111-4111-8111-111111111111';
const uploadId = '22222222-2222-4222-8222-222222222222';
const tempKey = `temp/products/${ownerId}/${uploadId}.jpg`;
const tempUrl = s3Service.getPublicUrl(tempKey);

describe('S3Service Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('extractKeyFromUrl', () => {
    it('extracts an S3 key from the configured bucket URL', () => {
      expect(s3Service.extractKeyFromUrl(tempUrl)).toBe(tempKey);
    });

    it('rejects foreign and invalid URLs', () => {
      expect(s3Service.extractKeyFromUrl('https://malicious-site.com/file.jpg')).toBeNull();
      expect(s3Service.extractKeyFromUrl('not-a-url')).toBeNull();
    });
  });

  describe('promoteTempUpload', () => {
    it('validates the uploaded object before copying it to a permanent key', async () => {
      vi.spyOn(s3Service, 'getObjectMetadata').mockResolvedValueOnce({
        contentLength: 1024,
        contentType: 'image/jpeg',
        eTag: '"safe-etag"',
      });
      vi.spyOn(s3Service, 'getObjectSignature').mockResolvedValueOnce(
        new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
      );
      const copySpy = vi.spyOn(s3Service, 'copyObject').mockResolvedValueOnce();

      const result = await s3Service.promoteTempUpload({
        url: tempUrl,
        expectedFolder: 'products',
        ownerId,
        allowedMimeTypes: ['image/jpeg'],
        maxSizeBytes: 10 * 1024 * 1024,
      });

      expect(copySpy).toHaveBeenCalledWith(
        tempKey,
        expect.stringMatching(/^products\/[a-f0-9-]+\.jpg$/),
        '"safe-etag"',
      );
      expect(result.tempKey).toBe(tempKey);
      expect(result.fileKey).toMatch(/^products\/[a-f0-9-]+\.jpg$/);
    });

    it('rejects a temp key owned by another user', async () => {
      await expect(
        s3Service.promoteTempUpload({
          url: tempUrl,
          expectedFolder: 'products',
          ownerId: '33333333-3333-4333-8333-333333333333',
          allowedMimeTypes: ['image/jpeg'],
          maxSizeBytes: 10 * 1024 * 1024,
        }),
      ).rejects.toMatchObject({ statusCode: 422, code: ERROR_CODES.INVALID_IMAGE_URL });
    });

    it('rejects permanent URLs supplied by a client', async () => {
      await expect(
        s3Service.promoteTempUpload({
          url: 'https://ecommerce-assets.s3.ap-southeast-1.amazonaws.com/products/shared.jpg',
          expectedFolder: 'products',
          ownerId,
          allowedMimeTypes: ['image/jpeg'],
          maxSizeBytes: 10 * 1024 * 1024,
        }),
      ).rejects.toMatchObject({ statusCode: 422, code: ERROR_CODES.INVALID_IMAGE_URL });
    });

    it('rejects content whose bytes do not match its MIME type', async () => {
      vi.spyOn(s3Service, 'getObjectMetadata').mockResolvedValueOnce({
        contentLength: 1024,
        contentType: 'image/jpeg',
        eTag: '"unsafe-etag"',
      });
      vi.spyOn(s3Service, 'getObjectSignature').mockResolvedValueOnce(
        new TextEncoder().encode('<html>'),
      );

      await expect(
        s3Service.promoteTempUpload({
          url: tempUrl,
          expectedFolder: 'products',
          ownerId,
          allowedMimeTypes: ['image/jpeg'],
          maxSizeBytes: 10 * 1024 * 1024,
        }),
      ).rejects.toMatchObject({ statusCode: 422, code: ERROR_CODES.INVALID_FILE_TYPE });
    });

    it('rejects the actual object size when it exceeds the purpose limit', async () => {
      vi.spyOn(s3Service, 'getObjectMetadata').mockResolvedValueOnce({
        contentLength: 11 * 1024 * 1024,
        contentType: 'image/jpeg',
        eTag: '"large-etag"',
      });

      await expect(
        s3Service.promoteTempUpload({
          url: tempUrl,
          expectedFolder: 'products',
          ownerId,
          allowedMimeTypes: ['image/jpeg'],
          maxSizeBytes: 10 * 1024 * 1024,
        }),
      ).rejects.toMatchObject({ statusCode: 422, code: ERROR_CODES.FILE_SIZE_EXCEEDED });
    });
  });

  it('retries failed cleanup operations', async () => {
    const deleteSpy = vi
      .spyOn(s3Service, 'deleteObjects')
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce();

    await s3Service.cleanupObjects(['products/test.jpg']);

    expect(deleteSpy).toHaveBeenCalledTimes(3);
  });
});
