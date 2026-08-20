import type { ErrorRequestHandler, RequestHandler } from 'express';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ERROR_CODES } from '../constants/index.js';
import { translateError } from '../i18n/index.js';
import { AppError } from '../utils/app-error.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: ERROR_CODES.ROUTE_NOT_FOUND,
      message: translateError(req.locale, ERROR_CODES.ROUTE_NOT_FOUND, {
        method: req.method,
        path: req.originalUrl,
      }),
    },
    requestId: req.id,
  });
};

export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, next) => {
  void next;

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: translateError(req.locale, error.code),
      },
      requestId: req.id,
    });
    return;
  }

  logger.error({ err: error, requestId: req.id }, 'Unhandled request error');

  res.status(500).json({
    error: {
      code: ERROR_CODES.INTERNAL_SERVER_ERROR,
      message: translateError(req.locale, ERROR_CODES.INTERNAL_SERVER_ERROR),
      ...(env.NODE_ENV === 'development' && error instanceof Error
        ? { details: error.message }
        : {}),
    },
    requestId: req.id,
  });
};
