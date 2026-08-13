import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AUTH_CONSTANTS } from '../constants/index.js';
import { createHash } from 'node:crypto';

export interface JwtPayload {
    userId: string;
    role: string;
    familyId?: string;
}

export const jwtService = {
    signAccessToken(payload: JwtPayload): string {
        return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
            expiresIn: AUTH_CONSTANTS.ACCESS_TOKEN_EXPIRES_IN,
        });
    },

    signRefreshToken(payload: JwtPayload): string {
        return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
            expiresIn: AUTH_CONSTANTS.REFRESH_TOKEN_EXPIRES_IN,
        });
    },

    verifyAccessToken(token: string): JwtPayload {
        return jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
    },

    verifyRefreshToken(token: string): JwtPayload {
        return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload;
    },

    hashToken(token: string): string {
        return createHash('sha256').update(token).digest('hex');
    },
};
