import { ERROR_CODES, UPLOAD_PURPOSES } from '../../constants/index.js';
import { s3Service } from '../../services/s3.service.js';
import { AppError } from '../../utils/app-error.js';
import { UPLOAD_POLICIES } from '../uploads/uploads.policy.js';
import { usersRepository } from './users.repository.js';
import type { CreateAddressDto, UpdateAddressDto, UpdateProfileDto } from './users.schema.js';

export const usersService = {
  async getProfile(userId: string) {
    const user = await usersRepository.findUserById(userId);

    if (!user) {
      throw new AppError(404, ERROR_CODES.USER_NOT_FOUND);
    }

    return user;
  },

  async updateProfile(userId: string, data: UpdateProfileDto) {
    const user = await usersRepository.findUserById(userId);

    if (!user) {
      throw new AppError(404, ERROR_CODES.USER_NOT_FOUND);
    }

    let finalAvatarUrl: string | null | undefined;
    let promotedAvatar: Awaited<ReturnType<typeof s3Service.promoteTempUpload>> | null = null;

    if (data.avatarUrl !== undefined) {
      if (data.avatarUrl === null) {
        finalAvatarUrl = null;
      } else {
        const policy = UPLOAD_POLICIES[UPLOAD_PURPOSES.USER_AVATAR];
        promotedAvatar = await s3Service.promoteTempUpload({
          url: data.avatarUrl,
          expectedFolder: policy.folder,
          ownerId: userId,
          allowedMimeTypes: policy.allowedMimeTypes,
          maxSizeBytes: policy.maxSizeBytes,
        });
        finalAvatarUrl = promotedAvatar.fileUrl;
      }
    }

    try {
      const updatedUser = await usersRepository.updateUser(userId, {
        fullName: data.fullName,
        avatarUrl: finalAvatarUrl,
      });

      const oldKey =
        data.avatarUrl !== undefined && user.avatarUrl
          ? s3Service.extractKeyFromUrl(user.avatarUrl)
          : null;
      await s3Service.cleanupObjects([
        ...(oldKey ? [oldKey] : []),
        ...(promotedAvatar ? [promotedAvatar.tempKey] : []),
      ]);

      return updatedUser;
    } catch (error) {
      if (promotedAvatar) {
        await s3Service.cleanupObjects([promotedAvatar.fileKey]);
      }
      throw error;
    }
  },

  async getAddresses(userId: string) {
    return usersRepository.findAddressesByUserId(userId);
  },

  async createAddress(userId: string, data: CreateAddressDto) {
    return usersRepository.createAddress(userId, data);
  },

  async updateAddress(id: string, userId: string, data: UpdateAddressDto) {
    const existing = await usersRepository.findAddressByIdAndUserId(id, userId);

    if (!existing) {
      throw new AppError(404, ERROR_CODES.ADDRESS_NOT_FOUND);
    }

    return usersRepository.updateAddress(id, userId, data);
  },

  async deleteAddress(id: string, userId: string) {
    const existing = await usersRepository.findAddressByIdAndUserId(id, userId);

    if (!existing) {
      throw new AppError(404, ERROR_CODES.ADDRESS_NOT_FOUND);
    }

    await usersRepository.deleteAddress(id, userId);
  },

  async setDefaultAddress(id: string, userId: string) {
    const existing = await usersRepository.findAddressByIdAndUserId(id, userId);

    if (!existing) {
      throw new AppError(404, ERROR_CODES.ADDRESS_NOT_FOUND);
    }

    return usersRepository.setDefaultAddress(id, userId);
  },
};
