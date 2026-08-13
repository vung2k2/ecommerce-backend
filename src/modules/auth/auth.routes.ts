import { Router } from 'express';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { authController } from './auth.controller.js';
import { registerSchema } from './auth.schema.js';

export const authRouter = Router();

authRouter.post('/register', validateBody(registerSchema), authController.register);
