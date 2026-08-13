import type { RequestHandler } from 'express';
import { sendSuccess } from '../../utils/response.js';
import type { RegisterInput } from './auth.schema.js';
import { authService } from './auth.service.js';

export const authController = {
  register: (async (request, response) => {
    const user = await authService.register(request.body);

    return sendSuccess(response, { user }, 201);
  }) as RequestHandler<Record<string, never>, unknown, RegisterInput>,
};
