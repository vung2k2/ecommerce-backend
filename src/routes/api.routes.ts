import { Router } from 'express';
import { staffRouter } from '../modules/admin/staff/staff.routes.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { adminCatalogRouter, publicCatalogRouter } from '../modules/catalog/catalog.routes.js';
import { usersRouter } from '../modules/users/users.routes.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/admin/staff', staffRouter);
apiRouter.use('/admin', adminCatalogRouter);
apiRouter.use('/', publicCatalogRouter);
