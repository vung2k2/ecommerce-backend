import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_CODES, UPLOAD_PURPOSES } from '../src/constants/index.js';
import { uploadsService } from '../src/modules/uploads/uploads.service.js';
import { s3Service } from '../src/services/s3.service.js';

const ownerId = '11111111-1111-4111-8111-111111111111';

describe('UploadsService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('validates, stages and promotes a JPEG image', async () => {
    const putSpy = vi.spyOn(s3Service, 'putObject').mockResolvedValue();
    const copySpy = vi.spyOn(s3Service, 'copyObject').mockResolvedValue();
    const cleanupSpy = vi.spyOn(s3Service, 'cleanupObjects').mockResolvedValue();
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

    const result = await uploadsService.storeImage(
      { buffer, mimetype: 'image/jpeg', size: buffer.length },
      UPLOAD_PURPOSES.USER_AVATAR,
      ownerId,
    );

    expect(putSpy).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^temp/avatars/${ownerId}/.*\\.jpg$`)),
      buffer,
      'image/jpeg',
    );
    expect(copySpy).toHaveBeenCalledWith(
      expect.stringMatching(/^temp\/avatars\//),
      expect.stringMatching(/^avatars\/.*\.jpg$/),
    );
    expect(cleanupSpy).toHaveBeenCalledWith([expect.stringMatching(/^temp\/avatars\//)]);
    expect(result.fileKey).toMatch(/^avatars\/.*\.jpg$/);
  });

  it('rejects bytes that do not match the declared MIME type before touching S3', async () => {
    const putSpy = vi.spyOn(s3Service, 'putObject').mockResolvedValue();

    await expect(
      uploadsService.storeImage(
        { buffer: Buffer.from('<html>'), mimetype: 'image/jpeg', size: 6 },
        UPLOAD_PURPOSES.USER_AVATAR,
        ownerId,
      ),
    ).rejects.toMatchObject({ statusCode: 422, code: ERROR_CODES.INVALID_FILE_TYPE });

    expect(putSpy).not.toHaveBeenCalled();
  });

  it('rejects an image larger than the purpose limit', async () => {
    await expect(
      uploadsService.storeImage(
        {
          buffer: Buffer.from([0xff, 0xd8, 0xff]),
          mimetype: 'image/jpeg',
          size: 3 * 1024 * 1024,
        },
        UPLOAD_PURPOSES.USER_AVATAR,
        ownerId,
      ),
    ).rejects.toMatchObject({ statusCode: 422, code: ERROR_CODES.FILE_SIZE_EXCEEDED });
  });

  it('cleans staged and destination keys when promotion fails', async () => {
    vi.spyOn(s3Service, 'putObject').mockResolvedValue();
    vi.spyOn(s3Service, 'copyObject').mockRejectedValue(new Error('copy failed'));
    const cleanupSpy = vi.spyOn(s3Service, 'cleanupObjects').mockResolvedValue();
    const buffer = Buffer.from([0xff, 0xd8, 0xff]);

    await expect(
      uploadsService.storeImage(
        { buffer, mimetype: 'image/jpeg', size: buffer.length },
        UPLOAD_PURPOSES.PRODUCT_IMAGE,
        ownerId,
      ),
    ).rejects.toThrow('copy failed');

    expect(cleanupSpy).toHaveBeenCalledWith([
      expect.stringMatching(/^temp\/products\//),
      expect.stringMatching(/^products\//),
    ]);
  });
});
