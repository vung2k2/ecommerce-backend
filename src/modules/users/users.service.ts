import { AppError } from '../../utils/app-error.js';
import { usersRepository } from './users.repository.js';
import type { CreateAddressDto, UpdateAddressDto, UpdateProfileDto } from './users.schema.js';

export const usersService = {
  async getProfile(userId: string) {
    const user = await usersRepository.findUserById(userId);

    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    }

    return user;
  },

  async updateProfile(userId: string, data: UpdateProfileDto) {
    const user = await usersRepository.findUserById(userId);

    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    }

    return usersRepository.updateUser(userId, data);
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
      throw new AppError(404, 'ADDRESS_NOT_FOUND', 'Address not found');
    }

    return usersRepository.updateAddress(id, userId, data);
  },

  async deleteAddress(id: string, userId: string) {
    const existing = await usersRepository.findAddressByIdAndUserId(id, userId);

    if (!existing) {
      throw new AppError(404, 'ADDRESS_NOT_FOUND', 'Address not found');
    }

    await usersRepository.deleteAddress(id, userId);
  },

  async setDefaultAddress(id: string, userId: string) {
    const existing = await usersRepository.findAddressByIdAndUserId(id, userId);

    if (!existing) {
      throw new AppError(404, 'ADDRESS_NOT_FOUND', 'Address not found');
    }

    return usersRepository.setDefaultAddress(id, userId);
  },
};
