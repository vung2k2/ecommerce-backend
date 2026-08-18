import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';

type PrismaClientOrTx = Prisma.TransactionClient | typeof prisma;

export interface CreateCustomerData {
  email: string;
  passwordHash: string;
  fullName: string;
}

export interface CreateRefreshTokenData {
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
}

export const authRepository = {
  lockUserSessions(userId: string, tx: Prisma.TransactionClient) {
    return tx.$queryRaw<Array<{ locked: string }>>`
      SELECT pg_advisory_xact_lock(hashtextextended(${`auth-user:${userId}`}, 0))::text AS locked
    `;
  },

  lockTokenFamily(familyId: string, tx: Prisma.TransactionClient) {
    return tx.$queryRaw<Array<{ locked: string }>>`
      SELECT pg_advisory_xact_lock(hashtextextended(${`auth-family:${familyId}`}, 0))::text AS locked
    `;
  },

  findUserByEmail(email: string, tx: PrismaClientOrTx = prisma) {
    return tx.user.findUnique({ where: { email } });
  },

  findUserById(id: string, tx: PrismaClientOrTx = prisma) {
    return tx.user.findUnique({ where: { id } });
  },

  createCustomer(data: CreateCustomerData, tx: PrismaClientOrTx = prisma) {
    return tx.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        fullName: data.fullName,
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

  createRefreshToken(data: CreateRefreshTokenData, tx: PrismaClientOrTx = prisma) {
    return tx.refreshToken.create({
      data,
    });
  },

  findRefreshTokenByHash(tokenHash: string, tx: PrismaClientOrTx = prisma) {
    return tx.refreshToken.findUnique({ where: { tokenHash } });
  },

  claimActiveRefreshToken(id: string, tx: PrismaClientOrTx = prisma) {
    return tx.refreshToken.updateMany({
      where: { id, isRevoked: false },
      data: { isRevoked: true },
    });
  },

  revokeTokenFamily(familyId: string, tx: PrismaClientOrTx = prisma) {
    return tx.refreshToken.updateMany({
      where: { familyId },
      data: { isRevoked: true },
    });
  },

  deleteRefreshToken(id: string, tx: PrismaClientOrTx = prisma) {
    return tx.refreshToken.delete({ where: { id } });
  },

  deleteAllUserRefreshTokens(userId: string, tx: PrismaClientOrTx = prisma) {
    return tx.refreshToken.deleteMany({
      where: { userId },
    });
  },
};
