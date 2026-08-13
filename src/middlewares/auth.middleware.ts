import type { RequestHandler } from 'express';
import { AppError } from '../utils/app-error.js';
import { jwtService } from '../utils/jwt.js';

export const requireAuth: RequestHandler = (request, _response, next) => {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError(401, 'UNAUTHORIZED', 'Access token is required');
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    throw new AppError(401, 'UNAUTHORIZED', 'Access token is required');
  }

  try {
    const payload = jwtService.verifyAccessToken(token);
    request.user = payload;
    next();
  } catch {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired access token');
  }
};
