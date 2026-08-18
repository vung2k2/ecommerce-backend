import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { validateBody, validateParams } from '../../middlewares/validate.middleware.js';
import { usersController } from './users.controller.js';
import {
  addressIdParamSchema,
  createAddressSchema,
  updateAddressSchema,
  updateProfileSchema,
} from './users.schema.js';

export const usersRouter = Router();

// Yêu cầu xác thực cho tất cả routes trong module users
usersRouter.use(requireAuth);

// Profile routes
usersRouter.get('/me', usersController.getProfile);
usersRouter.patch('/me', validateBody(updateProfileSchema), usersController.updateProfile);

// Address routes
usersRouter.get('/me/addresses', usersController.getAddresses);
usersRouter.post('/me/addresses', validateBody(createAddressSchema), usersController.createAddress,
);
usersRouter.patch('/me/addresses/:id', validateParams(addressIdParamSchema), validateBody(updateAddressSchema), usersController.updateAddress,
);
usersRouter.delete('/me/addresses/:id', validateParams(addressIdParamSchema), usersController.deleteAddress,
);
usersRouter.patch('/me/addresses/:id/default', validateParams(addressIdParamSchema), usersController.setDefaultAddress,
);
