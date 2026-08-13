import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { AUTH_CONSTANTS } from '../../constants/index.js';
import { prisma } from '../../database/prisma.js';
import { AppError } from '../../utils/app-error.js';
import { jwtService, type RefreshTokenPayload } from '../../utils/jwt.js';
import { authRepository } from './auth.repository.js';
import type { LoginInput, LogoutInput, RefreshTokenInput, RegisterInput } from './auth.schema.js';

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

  async login(input: LoginInput) {
    const user = await authRepository.findUserByEmail(input.email);

    if (!user) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    if (!user.isActive) {
      throw new AppError(403, 'INACTIVE_ACCOUNT', 'Your account is inactive');
    }

    const accessToken = jwtService.signAccessToken({
      userId: user.id,
      role: user.role,
    });

    const familyId = randomUUID();
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

  async refreshToken(input: RefreshTokenInput) {
    let payload: RefreshTokenPayload;

    try {
      payload = jwtService.verifyRefreshToken(input.refreshToken);
    } catch {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token');
    }

    const tokenHash = jwtService.hashToken(input.refreshToken);

    const outcome = await prisma.$transaction(async (tx): Promise<RefreshOutcome> => {
      const tokenReference = await authRepository.findRefreshTokenByHash(tokenHash, tx);

      if (!tokenReference) {
        return { kind: 'invalid' };
      }

      await authRepository.lockUserSessions(tokenReference.userId, tx);
      await authRepository.lockTokenFamily(tokenReference.familyId, tx);

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
        throw new AppError(403, 'INACTIVE_ACCOUNT', 'Your account is inactive');
      case 'reuse':
        throw new AppError(
          401,
          'TOKEN_REUSE_DETECTED',
          'Security alert: Token reuse detected. Please login again.',
        );
      case 'expired':
        throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token has expired');
      case 'invalid':
        throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token');
    }
  },

  async logout(input: LogoutInput) {
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
