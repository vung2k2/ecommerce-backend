import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadsService } from '../src/modules/uploads/uploads.service.js';
import { usersRepository } from '../src/modules/users/users.repository.js';
import { usersService } from '../src/modules/users/users.service.js';
import { s3Service } from '../src/services/s3.service.js';

const userId = '11111111-1111-4111-8111-111111111111';
const oldKey = 'avatars/old-avatar.jpg';
const oldUrl = s3Service.getPublicUrl(oldKey);
const newKey = 'avatars/new-avatar.jpg';
const newUrl = s3Service.getPublicUrl(newKey);
const file = {
  buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  mimetype: 'image/jpeg',
  size: 4,
};

const existingUser = {
  id: userId,
  email: 'user@example.com',
  fullName: 'User',
  avatarUrl: oldUrl,
  role: 'CUSTOMER',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('UsersService avatar consistency', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(usersRepository, 'findUserById').mockResolvedValue(existingUser as never);
    vi.spyOn(uploadsService, 'storeImage').mockResolvedValue({
      fileUrl: newUrl,
      fileKey: newKey,
    });
  });

  it('keeps the current avatar when the database update fails', async () => {
    vi.spyOn(usersRepository, 'updateUser').mockRejectedValueOnce(new Error('database failed'));
    const cleanupSpy = vi.spyOn(s3Service, 'cleanupObjects').mockResolvedValue();

    await expect(usersService.updateAvatar(userId, file)).rejects.toThrow('database failed');

    expect(cleanupSpy).toHaveBeenCalledWith([newKey]);
    expect(cleanupSpy).not.toHaveBeenCalledWith([oldKey]);
  });

  it('cleans the old object after the database update succeeds', async () => {
    vi.spyOn(usersRepository, 'updateUser').mockResolvedValueOnce({
      ...existingUser,
      avatarUrl: newUrl,
    } as never);
    const cleanupSpy = vi.spyOn(s3Service, 'cleanupObjects').mockResolvedValue();

    const result = await usersService.updateAvatar(userId, file);

    expect(result.avatarUrl).toBe(newUrl);
    expect(cleanupSpy).toHaveBeenCalledWith([oldKey]);
  });
});
