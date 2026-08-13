import type { ErrorRequestHandler, RequestHandler } from 'express';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/app-error.js';

export const notFoundHandler: RequestHandler = (request, response) => {
  response.status(404).json({
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Route ${request.method} ${request.originalUrl} was not found`,
      requestId: request.id,
    },
  });
};

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, next) => {
  void next;

  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        requestId: request.id,
      },
    });
    return;
  }

  logger.error({ err: error, requestId: request.id }, 'Unhandled request error');

  response.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      requestId: request.id,
      ...(env.NODE_ENV === 'development' && error instanceof Error
        ? { details: error.message }
        : {}),
    },
  });
};
