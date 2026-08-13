import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { authController } from './auth.controller.js';
import { loginSchema, logoutSchema, refreshTokenSchema, registerSchema } from './auth.schema.js';

export const authRouter = Router();

authRouter.post('/register', validateBody(registerSchema), authController.register);
authRouter.post('/login', validateBody(loginSchema), authController.login);
authRouter.post('/refresh', validateBody(refreshTokenSchema), authController.refreshToken);
authRouter.post('/logout', validateBody(logoutSchema), authController.logout);
authRouter.post('/logout-all', requireAuth, authController.logoutAll);
