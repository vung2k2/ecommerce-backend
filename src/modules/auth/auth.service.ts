import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { AUTH_CONSTANTS } from '../../constants/index.js';
import { AppError } from '../../utils/app-error.js';
import { jwtService, type JwtPayload } from '../../utils/jwt.js';
import { authRepository } from './auth.repository.js';
import type { LoginInput, LogoutInput, RefreshTokenInput, RegisterInput } from './auth.schema.js';

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
    let payload: JwtPayload;

    try {
      payload = jwtService.verifyRefreshToken(input.refreshToken);
    } catch {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token');
    }

    const tokenHash = jwtService.hashToken(input.refreshToken);
    const storedToken = await authRepository.findRefreshTokenByHash(tokenHash);

    if (!storedToken) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token');
    }

    // Reuse Detection: Token is marked revoked, but someone is reusing it!
    if (storedToken.isRevoked) {
      if (payload.familyId) {
        await authRepository.revokeTokenFamily(payload.familyId);
      }
      throw new AppError(
        401,
        'TOKEN_REUSE_DETECTED',
        'Security alert: Token reuse detected. Please login again.',
      );
    }

    if (storedToken.expiresAt < new Date()) {
      await authRepository.deleteRefreshToken(storedToken.id);
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token has expired');
    }

    const user = await authRepository.findUserById(storedToken.userId);

    if (!user || !user.isActive) {
      throw new AppError(403, 'INACTIVE_ACCOUNT', 'Your account is inactive');
    }

    const familyId = payload.familyId || storedToken.familyId;

    // Token rotation: Revoke current token
    await authRepository.updateRefreshToken(storedToken.id, { isRevoked: true });

    // Issue new pair with SAME familyId
    const newAccessToken = jwtService.signAccessToken({
      userId: user.id,
      role: user.role,
    });

    const newRefreshToken = jwtService.signRefreshToken({
      userId: user.id,
      role: user.role,
      familyId,
    });

    const newRefreshTokenHash = jwtService.hashToken(newRefreshToken);
    const expiresAt = new Date(
      Date.now() + AUTH_CONSTANTS.REFRESH_TOKEN_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000,
    );

    await authRepository.createRefreshToken({
      userId: user.id,
      familyId,
      tokenHash: newRefreshTokenHash,
      expiresAt,
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  },

  async logout(input: LogoutInput) {
    const refreshTokenHash = jwtService.hashToken(input.refreshToken);
    const refreshToken = await authRepository.findRefreshTokenByHash(refreshTokenHash);

    if (refreshToken) {
      await authRepository.deleteRefreshToken(refreshToken.id);
    }
  },

  async logoutAll(userId: string) {
    await authRepository.deleteAllUserRefreshTokens(userId);
  },
};
