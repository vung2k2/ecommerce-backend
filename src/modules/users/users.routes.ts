import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { validateBody, validateParams } from '../../middlewares/validate.middleware.js';
import { usersController } from './users.controller.js';
import {
  addressIdParamSchema,
  addressListResponseSchema,
  addressResponseSchema,
  createAddressSchema,
  deleteAddressResponseSchema,
  updateAddressSchema,
  updateProfileSchema,
  userResponseSchema,
} from './users.schema.js';
import {
  registry,
  createSuccessResponseSchema,
  errorResponse,
} from '../../docs/registry.js';

export const usersRouter = Router();

// Yêu cầu xác thực cho tất cả routes trong module users
usersRouter.use(requireAuth);

registry.registerPath({
  method: 'get',
  path: '/users/me',
  summary: 'Get current user profile',
  tags: ['Users'],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'Profile retrieved successfully',
      content: { 'application/json': { schema: createSuccessResponseSchema(userResponseSchema) } },
    },
    404: errorResponse('USER_NOT_FOUND'),
  },
});
usersRouter.get('/me', usersController.getProfile);

registry.registerPath({
  method: 'patch',
  path: '/users/me',
  summary: 'Update current user profile',
  tags: ['Users'],
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { 'application/json': { schema: updateProfileSchema } } },
  },
  responses: {
    200: {
      description: 'Profile updated successfully',
      content: { 'application/json': { schema: createSuccessResponseSchema(userResponseSchema) } },
    },
    404: errorResponse('USER_NOT_FOUND'),
  },
});
usersRouter.patch('/me', validateBody(updateProfileSchema), usersController.updateProfile);

registry.registerPath({
  method: 'get',
  path: '/users/me/addresses',
  summary: 'Get all addresses of current user',
  tags: ['Users'],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'Addresses retrieved successfully',
      content: {
        'application/json': { schema: createSuccessResponseSchema(addressListResponseSchema) },
      },
    },
  },
});
usersRouter.get('/me/addresses', usersController.getAddresses);

registry.registerPath({
  method: 'post',
  path: '/users/me/addresses',
  summary: 'Create a new address',
  tags: ['Users'],
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { 'application/json': { schema: createAddressSchema } } },
  },
  responses: {
    201: {
      description: 'Address created successfully',
      content: {
        'application/json': { schema: createSuccessResponseSchema(addressResponseSchema) },
      },
    },
  },
});
usersRouter.post('/me/addresses', validateBody(createAddressSchema), usersController.createAddress);

registry.registerPath({
  method: 'patch',
  path: '/users/me/addresses/{id}',
  summary: 'Update an existing address',
  tags: ['Users'],
  security: [{ bearerAuth: [] }],
  request: {
    params: addressIdParamSchema,
    body: { content: { 'application/json': { schema: updateAddressSchema } } },
  },
  responses: {
    200: {
      description: 'Address updated successfully',
      content: {
        'application/json': { schema: createSuccessResponseSchema(addressResponseSchema) },
      },
    },
    404: errorResponse('ADDRESS_NOT_FOUND'),
  },
});
usersRouter.patch(
  '/me/addresses/:id',
  validateParams(addressIdParamSchema),
  validateBody(updateAddressSchema),
  usersController.updateAddress,
);

registry.registerPath({
  method: 'delete',
  path: '/users/me/addresses/{id}',
  summary: 'Delete an address',
  tags: ['Users'],
  security: [{ bearerAuth: [] }],
  request: {
    params: addressIdParamSchema,
  },
  responses: {
    200: {
      description: 'Address deleted successfully',
      content: {
        'application/json': { schema: createSuccessResponseSchema(deleteAddressResponseSchema) },
      },
    },
    404: errorResponse('ADDRESS_NOT_FOUND'),
  },
});
usersRouter.delete(
  '/me/addresses/:id',
  validateParams(addressIdParamSchema),
  usersController.deleteAddress,
);

registry.registerPath({
  method: 'patch',
  path: '/users/me/addresses/{id}/default',
  summary: 'Set an address as default',
  tags: ['Users'],
  security: [{ bearerAuth: [] }],
  request: {
    params: addressIdParamSchema,
  },
  responses: {
    200: {
      description: 'Address set as default successfully',
      content: {
        'application/json': { schema: createSuccessResponseSchema(addressResponseSchema) },
      },
    },
    404: errorResponse('ADDRESS_NOT_FOUND'),
  },
});
usersRouter.patch(
  '/me/addresses/:id/default',
  validateParams(addressIdParamSchema),
  usersController.setDefaultAddress,
);
