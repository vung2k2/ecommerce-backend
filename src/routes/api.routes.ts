import { Router } from 'express';
import { staffRouter } from '../modules/admin/staff/staff.routes.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { cartRouter } from '../modules/cart/cart.routes.js';
import { adminCatalogRouter, publicCatalogRouter } from '../modules/catalog/catalog.routes.js';
import { adminCouponRouter, customerCouponRouter } from '../modules/coupons/coupons.routes.js';
import { inventoryRouter } from '../modules/inventory/inventory.routes.js';
import {
  adminOrderRouter,
  checkoutRouter,
  customerOrderRouter,
} from '../modules/orders/orders.routes.js';
import { paymentsRouter } from '../modules/payments/payments.routes.js';
import { usersRouter } from '../modules/users/users.routes.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/cart', cartRouter);
apiRouter.use('/coupons', customerCouponRouter);
apiRouter.use('/checkout', checkoutRouter);
apiRouter.use('/orders', customerOrderRouter);
apiRouter.use('/payments', paymentsRouter);
apiRouter.use('/admin/staff', staffRouter);
apiRouter.use('/admin/inventory', inventoryRouter);
apiRouter.use('/admin/coupons', adminCouponRouter);
apiRouter.use('/admin/orders', adminOrderRouter);
apiRouter.use('/admin', adminCatalogRouter);
apiRouter.use('/', publicCatalogRouter);


