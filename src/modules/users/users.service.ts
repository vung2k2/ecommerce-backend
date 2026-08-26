import { ERROR_CODES, UPLOAD_PURPOSES } from '../../constants/index.js';
import { s3Service } from '../../services/s3.service.js';
import { AppError } from '../../utils/app-error.js';
import { uploadsService, type ImageFile } from '../uploads/uploads.service.js';
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

    return usersRepository.updateUser(userId, { fullName: data.fullName });
  },

  async updateAvatar(userId: string, file: ImageFile) {
    const user = await usersRepository.findUserById(userId);
    if (!user) {
      throw new AppError(404, ERROR_CODES.USER_NOT_FOUND);
    }

    const uploaded = await uploadsService.storeImage(file, UPLOAD_PURPOSES.USER_AVATAR, userId);

    try {
      const updatedUser = await usersRepository.updateUser(userId, {
        avatarUrl: uploaded.fileUrl,
      });
      const oldKey = user.avatarUrl ? s3Service.extractKeyFromUrl(user.avatarUrl) : null;
      await s3Service.cleanupObjects(oldKey ? [oldKey] : []);
      return updatedUser;
    } catch (error) {
      await s3Service.cleanupObjects([uploaded.fileKey]);
      throw error;
    }
  },

  async deleteAvatar(userId: string) {
    const user = await usersRepository.findUserById(userId);
    if (!user) {
      throw new AppError(404, ERROR_CODES.USER_NOT_FOUND);
    }

    const updatedUser = await usersRepository.updateUser(userId, { avatarUrl: null });
    const oldKey = user.avatarUrl ? s3Service.extractKeyFromUrl(user.avatarUrl) : null;
    await s3Service.cleanupObjects(oldKey ? [oldKey] : []);
    return updatedUser;
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
