import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { AUTH_CONSTANTS, ERROR_CODES } from '../../constants/index.js';
import { prisma } from '../../database/prisma.js';
import { AppError } from '../../utils/app-error.js';
import { jwtService, type RefreshTokenPayload } from '../../utils/jwt.js';
import { authRepository } from './auth.repository.js';
import type { LoginDto, LogoutDto, RefreshTokenDto, RegisterDto } from './auth.schema.js';

const BCRYPT_SALT_ROUNDS = 12;

type RefreshOutcome =
  | { kind: 'success'; accessToken: string; refreshToken: string }
  | { kind: 'invalid' }
  | { kind: 'expired' }
  | { kind: 'inactive' }
  | { kind: 'reuse' };

function isUniqueConstraintError(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

export const authService = {
  async register(input: RegisterDto) {
    const existingUser = await authRepository.findUserByEmail(input.email);

    if (existingUser) {
      throw new AppError(409, ERROR_CODES.EMAIL_ALREADY_EXISTS);
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);

    try {
      return await authRepository.createCustomer({
        email: input.email,
        passwordHash,
        fullName: input.fullName,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AppError(409, ERROR_CODES.EMAIL_ALREADY_EXISTS);
      }

      throw error;
    }
  },

  async login(input: LoginDto) {
    const user = await authRepository.findUserByEmail(input.email);

    if (!user) {
      throw new AppError(401, ERROR_CODES.INVALID_CREDENTIALS);
    }

    if (!user.isActive) {
      throw new AppError(403, ERROR_CODES.INACTIVE_ACCOUNT);
    }

    const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new AppError(401, ERROR_CODES.INVALID_CREDENTIALS);
    }

    const familyId = randomUUID();
    const accessToken = jwtService.signAccessToken({
      userId: user.id,
      role: user.role,
    });
    const refreshToken = jwtService.signRefreshToken({
      userId: user.id,
      role: user.role,
      familyId,
    });

    const refreshTokenHash = jwtService.hashToken(refreshToken);
    const expiresAt = new Date(
      Date.now() + AUTH_CONSTANTS.REFRESH_TOKEN_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000,
    );

    await authRepository.createRefreshToken({
      userId: user.id,
      familyId,
      tokenHash: refreshTokenHash,
      expiresAt,
    });

    return { accessToken, refreshToken };
  },

  async refreshToken(input: RefreshTokenDto) {
    let payload: RefreshTokenPayload;

    try {
      payload = jwtService.verifyRefreshToken(input.refreshToken);
    } catch {
      throw new AppError(401, ERROR_CODES.INVALID_REFRESH_TOKEN);
    }

    const tokenHash = jwtService.hashToken(input.refreshToken);

    const outcome = await prisma.$transaction(async (tx): Promise<RefreshOutcome> => {
      await authRepository.lockUserSessions(payload.userId, tx);
      await authRepository.lockTokenFamily(payload.familyId, tx);

      const storedToken = await authRepository.findRefreshTokenByHash(tokenHash, tx);

      if (!storedToken) {
        return { kind: 'invalid' };
      }

      if (payload.userId !== storedToken.userId || payload.familyId !== storedToken.familyId) {
        await authRepository.revokeTokenFamily(storedToken.familyId, tx);
        return { kind: 'reuse' };
      }

      if (storedToken.isRevoked) {
        await authRepository.revokeTokenFamily(storedToken.familyId, tx);
        return { kind: 'reuse' };
      }

      if (storedToken.expiresAt <= new Date()) {
        await authRepository.deleteRefreshToken(storedToken.id, tx);
        return { kind: 'expired' };
      }

      const user = await authRepository.findUserById(storedToken.userId, tx);

      if (!user || !user.isActive) {
        await authRepository.revokeTokenFamily(storedToken.familyId, tx);
        return { kind: 'inactive' };
      }

      const claim = await authRepository.claimActiveRefreshToken(storedToken.id, tx);

      if (claim.count !== 1) {
        await authRepository.revokeTokenFamily(storedToken.familyId, tx);
        return { kind: 'reuse' };
      }

      const newAccessToken = jwtService.signAccessToken({
        userId: user.id,
        role: user.role,
      });

      const newRefreshToken = jwtService.signRefreshToken({
        userId: user.id,
        role: user.role,
        familyId: storedToken.familyId,
      });

      const newRefreshTokenHash = jwtService.hashToken(newRefreshToken);
      const expiresAt = new Date(
        Date.now() + AUTH_CONSTANTS.REFRESH_TOKEN_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000,
      );

      await authRepository.createRefreshToken(
        {
          userId: user.id,
          familyId: storedToken.familyId,
          tokenHash: newRefreshTokenHash,
          expiresAt,
        },
        tx,
      );

      return {
        kind: 'success',
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      };
    });

    switch (outcome.kind) {
      case 'success':
        return { accessToken: outcome.accessToken, refreshToken: outcome.refreshToken };
      case 'inactive':
        throw new AppError(403, ERROR_CODES.INACTIVE_ACCOUNT);
      case 'reuse':
        throw new AppError(401, ERROR_CODES.TOKEN_REUSE_DETECTED);
      case 'expired':
        throw new AppError(401, ERROR_CODES.INVALID_REFRESH_TOKEN);
      case 'invalid':
        throw new AppError(401, ERROR_CODES.INVALID_REFRESH_TOKEN);
    }
  },

  async logout(input: LogoutDto) {
    const refreshTokenHash = jwtService.hashToken(input.refreshToken);

    await prisma.$transaction(async (tx) => {
      const storedToken = await authRepository.findRefreshTokenByHash(refreshTokenHash, tx);

      if (storedToken) {
        await authRepository.lockTokenFamily(storedToken.familyId, tx);
        await authRepository.revokeTokenFamily(storedToken.familyId, tx);
      }
    });
  },

  async logoutAll(userId: string) {
    await prisma.$transaction(async (tx) => {
      await authRepository.lockUserSessions(userId, tx);
      await authRepository.deleteAllUserRefreshTokens(userId, tx);
    });
  },
};
