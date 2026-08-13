import bcrypt from 'bcrypt';
import { AppError } from '../../utils/app-error.js';
import { authRepository } from './auth.repository.js';
import type { RegisterInput } from './auth.schema.js';

const BCRYPT_SALT_ROUNDS = 12;

function isUniqueConstraintError(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

export const authService = {
  async register(input: RegisterInput) {
    const existingUser = await authRepository.findUserByEmail(input.email);

    if (existingUser) {
      throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Email is already registered');
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);

    try {
      return await authRepository.createCustomer({ ...input, passwordHash });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Email is already registered');
      }

      throw error;
    }
  },
};
