import { prisma } from '../../database/prisma.js';
import type { RegisterInput } from './auth.schema.js';

export const authRepository = {
  findUserByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  findUserById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },

  createCustomer(input: RegisterInput & { passwordHash: string }) {
    return prisma.user.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        fullName: input.fullName,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        createdAt: true,
      },
    });
  },

  createRefreshToken(data: {
    userId: string;
    familyId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    return prisma.refreshToken.create({
      data,
    });
  },

  findRefreshTokenByHash(tokenHash: string) {
    return prisma.refreshToken.findUnique({ where: { tokenHash } });
  },

  updateRefreshToken(id: string, data: { isRevoked?: boolean }) {
    return prisma.refreshToken.update({
      where: { id },
      data,
    });
  },

  revokeTokenFamily(familyId: string) {
    return prisma.refreshToken.updateMany({
      where: { familyId },
      data: { isRevoked: true },
    });
  },

  deleteRefreshToken(id: string) {
    return prisma.refreshToken.delete({ where: { id } });
  },

  deleteAllUserRefreshTokens(userId: string) {
    return prisma.refreshToken.deleteMany({
      where: { userId },
    });
  },
};
