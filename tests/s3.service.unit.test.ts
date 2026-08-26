import { beforeEach, describe, expect, it, vi } from 'vitest';
import { s3Service } from '../src/services/s3.service.js';

describe('S3Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts only keys belonging to the configured storage origin', () => {
    const key = 'avatars/avatar.jpg';
    expect(s3Service.extractKeyFromUrl(s3Service.getPublicUrl(key))).toBe(key);
    expect(s3Service.extractKeyFromUrl('https://malicious.example/avatar.jpg')).toBeNull();
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
