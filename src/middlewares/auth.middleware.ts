import type { RequestHandler } from 'express';
import { ERROR_CODES } from '../constants/index.js';
import { AppError } from '../utils/app-error.js';
import { jwtService } from '../utils/jwt.js';

export const requireAuth: RequestHandler = (req, _res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError(401, ERROR_CODES.UNAUTHORIZED);
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    throw new AppError(401, ERROR_CODES.UNAUTHORIZED);
  }

  try {
    const payload = jwtService.verifyAccessToken(token);
    req.user = payload;
    next();
  } catch {
    throw new AppError(401, ERROR_CODES.UNAUTHORIZED);
  }
};
