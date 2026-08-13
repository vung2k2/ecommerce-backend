import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
