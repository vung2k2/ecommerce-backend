import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { env } from '../../config/env.js';
import { ERROR_CODES } from '../../constants/index.js';
import { translateError } from '../../i18n/index.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { authController } from './auth.controller.js';
import {
  loginSchema,
  logoutSchema,
  logoutResponseDataSchema,
  refreshTokenSchema,
  registerSchema,
  registerResponseDataSchema,
  tokenResponseDataSchema,
} from './auth.schema.js';
import {
  registry,
  createSuccessResponseSchema,
  errorResponse,
} from '../../docs/registry.js';

export const authRouter = Router();

function createAuthRateLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: env.NODE_ENV === 'test' ? 1000 : 15,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: {
          code: ERROR_CODES.TOO_MANY_REQUESTS,
          message: translateError(req.locale, ERROR_CODES.TOO_MANY_REQUESTS),
        },
        requestId: req.id,
      });
    },
  });
}

export const registerRateLimiter = createAuthRateLimiter();
export const loginRateLimiter = createAuthRateLimiter();
export const refreshRateLimiter = createAuthRateLimiter();

registry.registerPath({
  method: 'post',
  path: '/auth/register',
  summary: 'Register a new customer account',
  tags: ['Auth'],
  request: {
    body: {
      content: { 'application/json': { schema: registerSchema } },
    },
  },
  responses: {
    201: {
      description: 'Customer account registered successfully',
      content: {
        'application/json': { schema: createSuccessResponseSchema(registerResponseDataSchema) },
      },
    },
    409: errorResponse(ERROR_CODES.EMAIL_ALREADY_EXISTS),
  },
});
authRouter.post(
  '/register',
  registerRateLimiter,
  validateBody(registerSchema),
  authController.register,
);

registry.registerPath({
  method: 'post',
  path: '/auth/login',
  summary: 'Authenticate customer and obtain tokens',
  tags: ['Auth'],
  request: {
    body: {
      content: { 'application/json': { schema: loginSchema } },
    },
  },
  responses: {
    200: {
      description: 'Login successful',
      content: {
        'application/json': { schema: createSuccessResponseSchema(tokenResponseDataSchema) },
      },
    },
    401: errorResponse(ERROR_CODES.INVALID_CREDENTIALS),
    403: errorResponse(ERROR_CODES.INACTIVE_ACCOUNT),
  },
});
authRouter.post('/login', loginRateLimiter, validateBody(loginSchema), authController.login);

registry.registerPath({
  method: 'post',
  path: '/auth/refresh',
  summary: 'Rotate refresh token and issue a new access token',
  tags: ['Auth'],
  request: {
    body: {
      content: { 'application/json': { schema: refreshTokenSchema } },
    },
  },
  responses: {
    200: {
      description: 'Token rotated successfully',
      content: {
        'application/json': { schema: createSuccessResponseSchema(tokenResponseDataSchema) },
      },
    },
    401: errorResponse([
      ERROR_CODES.INVALID_REFRESH_TOKEN,
      ERROR_CODES.TOKEN_REUSE_DETECTED,
    ]),
    403: errorResponse(ERROR_CODES.INACTIVE_ACCOUNT),
  },
});
authRouter.post(
  '/refresh',
  refreshRateLimiter,
  validateBody(refreshTokenSchema),
  authController.refreshToken,
);

registry.registerPath({
  method: 'post',
  path: '/auth/logout',
  summary: 'Logout from current device',
  tags: ['Auth'],
  request: {
    body: {
      content: { 'application/json': { schema: logoutSchema } },
    },
  },
  responses: {
    200: {
      description: 'Logged out successfully',
      content: {
        'application/json': { schema: createSuccessResponseSchema(logoutResponseDataSchema) },
      },
    },
  },
});
authRouter.post('/logout', validateBody(logoutSchema), authController.logout);

registry.registerPath({
  method: 'post',
  path: '/auth/logout-all',
  summary: 'Logout from all devices',
  tags: ['Auth'],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'Logged out from all devices successfully',
      content: {
        'application/json': { schema: createSuccessResponseSchema(logoutResponseDataSchema) },
      },
    },
  },
});
authRouter.post('/logout-all', requireAuth, authController.logoutAll);
