import type { Request, RequestHandler, Response } from 'express';
import type { ZodIssue, ZodType } from 'zod';
import { ERROR_CODES } from '../constants/index.js';
import {
  translate,
  translateValidationIssue,
  type MessageKey,
} from '../i18n/index.js';

function sendValidationError(
  req: Request,
  res: Response,
  messageKey: MessageKey,
  issues: ZodIssue[],
) {
  res.status(422).json({
    error: {
      code: ERROR_CODES.VALIDATION_ERROR,
      message: translate(req.locale, messageKey),
      details: issues.map((issue) => ({
        path: issue.path.join('.'),
        message: translateValidationIssue(req.locale, issue),
      })),
    },
    requestId: req.id,
  });
}

export function validateBody(schema: ZodType): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.body as unknown);

    if (!result.success) {
      sendValidationError(req, res, 'validation.bodyInvalid', result.error.issues);
      return;
    }

    req.body = result.data;
    next();
  };
}

export function validateParams(schema: ZodType): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      sendValidationError(req, res, 'validation.paramsInvalid', result.error.issues);
      return;
    }

    req.params = result.data as Record<string, string>;
    next();
  };
}

export function validateQuery(schema: ZodType): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      sendValidationError(req, res, 'validation.queryInvalid', result.error.issues);
      return;
    }

    Object.defineProperty(req, 'query', {
      value: result.data,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    next();
  };
}
