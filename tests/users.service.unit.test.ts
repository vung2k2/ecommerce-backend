import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usersRepository } from '../src/modules/users/users.repository.js';
import { usersService } from '../src/modules/users/users.service.js';
import { s3Service } from '../src/services/s3.service.js';

const userId = '11111111-1111-4111-8111-111111111111';
const oldKey = 'avatars/old-avatar.jpg';
const oldUrl = `https://ecommerce-assets.s3.ap-southeast-1.amazonaws.com/${oldKey}`;
const tempKey = `temp/avatars/${userId}/22222222-2222-4222-8222-222222222222.jpg`;
const tempUrl = `https://ecommerce-assets.s3.ap-southeast-1.amazonaws.com/${tempKey}`;
const newKey = 'avatars/33333333-3333-4333-8333-333333333333.jpg';
const newUrl = `https://ecommerce-assets.s3.ap-southeast-1.amazonaws.com/${newKey}`;

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
    vi.spyOn(s3Service, 'promoteTempUpload').mockResolvedValue({
      fileUrl: newUrl,
      fileKey: newKey,
      tempKey,
    });
  });

  it('does not delete the current avatar when the database update fails', async () => {
    vi.spyOn(usersRepository, 'updateUser').mockRejectedValueOnce(new Error('database failed'));
    const cleanupSpy = vi.spyOn(s3Service, 'cleanupObjects').mockResolvedValue();

    await expect(usersService.updateProfile(userId, { avatarUrl: tempUrl })).rejects.toThrow(
      'database failed',
    );

    expect(cleanupSpy).toHaveBeenCalledWith([newKey]);
    expect(cleanupSpy).not.toHaveBeenCalledWith(expect.arrayContaining([oldKey]));
  });

  it('cleans the old and temporary objects only after the database update succeeds', async () => {
    vi.spyOn(usersRepository, 'updateUser').mockResolvedValueOnce({
      ...existingUser,
      avatarUrl: newUrl,
    } as never);
    const cleanupSpy = vi.spyOn(s3Service, 'cleanupObjects').mockResolvedValue();

    const result = await usersService.updateProfile(userId, { avatarUrl: tempUrl });

    expect(result.avatarUrl).toBe(newUrl);
    expect(cleanupSpy).toHaveBeenCalledWith([oldKey, tempKey]);
  });
});
