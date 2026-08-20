import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'node:crypto';
import { z } from './zod.js';
import { env } from '../config/env.js';
import { AUTH_CONSTANTS, ERROR_CODES, ROLES, type Role } from '../constants/index.js';
import { AppError } from './app-error.js';

const JWT_ALGORITHM = 'HS256';
const JWT_ISSUER = 'ecommerce-backend';
const ACCESS_TOKEN_AUDIENCE = 'ecommerce-api';
const REFRESH_TOKEN_AUDIENCE = 'ecommerce-auth';

const basePayloadSchema = z.object({
  userId: z.uuid(),
  role: z.enum([ROLES.CUSTOMER, ROLES.STAFF, ROLES.ADMIN]),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
});

const accessTokenPayloadSchema = basePayloadSchema.extend({
  tokenType: z.literal('access'),
});

const refreshTokenPayloadSchema = basePayloadSchema.extend({
  familyId: z.uuid(),
  jti: z.uuid(),
  tokenType: z.literal('refresh'),
});

export type AccessTokenPayload = z.infer<typeof accessTokenPayloadSchema>;
export type RefreshTokenPayload = z.infer<typeof refreshTokenPayloadSchema>;
export type JwtPayload = AccessTokenPayload | RefreshTokenPayload;

interface AccessTokenInput {
  userId: string;
  role: Role;
}

interface RefreshTokenInput extends AccessTokenInput {
  familyId: string;
}

export const jwtService = {
  signAccessToken(payload: AccessTokenInput): string {
    return jwt.sign(
      {
        ...payload,
        tokenType: 'access',
      },
      env.JWT_ACCESS_SECRET,
      {
        algorithm: JWT_ALGORITHM,
        audience: ACCESS_TOKEN_AUDIENCE,
        expiresIn: AUTH_CONSTANTS.ACCESS_TOKEN_EXPIRES_IN,
        issuer: JWT_ISSUER,
      },
    );
  },

  signRefreshToken(payload: RefreshTokenInput): string {
    return jwt.sign(
      {
        ...payload,
        jti: randomUUID(),
        tokenType: 'refresh',
      },
      env.JWT_REFRESH_SECRET,
      {
        algorithm: JWT_ALGORITHM,
        audience: REFRESH_TOKEN_AUDIENCE,
        expiresIn: AUTH_CONSTANTS.REFRESH_TOKEN_EXPIRES_IN,
        issuer: JWT_ISSUER,
      },
    );
  },

  verifyAccessToken(token: string): AccessTokenPayload {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: [JWT_ALGORITHM],
      audience: ACCESS_TOKEN_AUDIENCE,
      issuer: JWT_ISSUER,
    });
    const result = accessTokenPayloadSchema.safeParse(decoded);

    if (!result.success) {
      throw new AppError(401, ERROR_CODES.UNAUTHORIZED);
    }

    return result.data;
  },

  verifyRefreshToken(token: string): RefreshTokenPayload {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, {
      algorithms: [JWT_ALGORITHM],
      audience: REFRESH_TOKEN_AUDIENCE,
      issuer: JWT_ISSUER,
    });
    const result = refreshTokenPayloadSchema.safeParse(decoded);

    if (!result.success) {
      throw new AppError(401, ERROR_CODES.INVALID_REFRESH_TOKEN);
    }

    return result.data;
  },

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  },
};
