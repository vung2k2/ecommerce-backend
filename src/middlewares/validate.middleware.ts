import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

export function validateBody(schema: ZodType): RequestHandler {
  return (request, response, next) => {
    const result = schema.safeParse(request.body as unknown);

    if (!result.success) {
      response.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request body is invalid',
          requestId: request.id,
          details: result.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      });
      return;
    }

    request.body = result.data;
    next();
  };
}
