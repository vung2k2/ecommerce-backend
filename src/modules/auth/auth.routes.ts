import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { env } from '../../config/env.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { authController } from './auth.controller.js';
import { loginSchema, logoutSchema, refreshTokenSchema, registerSchema } from './auth.schema.js';

export const authRouter = Router();

function createAuthRateLimiter(actionName: string) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: env.NODE_ENV === 'test' ? 1000 : 15,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: `Too many ${actionName} requests, please try again later.`,
          requestId: req.id,
        },
      });
    },
  });
}

export const registerRateLimiter = createAuthRateLimiter('register');
export const loginRateLimiter = createAuthRateLimiter('login');
export const refreshRateLimiter = createAuthRateLimiter('refresh');

authRouter.post('/register', registerRateLimiter, validateBody(registerSchema), authController.register);
authRouter.post('/login', loginRateLimiter, validateBody(loginSchema), authController.login);
authRouter.post('/refresh', refreshRateLimiter, validateBody(refreshTokenSchema), authController.refreshToken);
authRouter.post('/logout', validateBody(logoutSchema), authController.logout);
authRouter.post('/logout-all', requireAuth, authController.logoutAll);
