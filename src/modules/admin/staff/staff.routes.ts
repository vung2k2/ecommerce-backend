import { Router } from 'express';
import { ERROR_CODES, ROLES } from '../../../constants/index.js';
import { requireAuth } from '../../../middlewares/auth.middleware.js';
import { requireRole } from '../../../middlewares/permission.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../../middlewares/validate.middleware.js';
import { staffController } from './staff.controller.js';
import {
  createStaffBodySchema,
  getStaffQuerySchema,
  staffResponseDataSchema,
  staffResponseItemSchema,
  staffIdParamSchema,
  updateStaffPermissionsBodySchema,
  updateStaffStatusBodySchema,
} from './staff.schema.js';
import {
  registry,
  createPaginatedResponseSchema,
  createSuccessResponseSchema,
  errorResponse,
} from '../../../docs/registry.js';

export const staffRouter = Router();

// Toàn bộ route trong module quản lý staff yêu cầu đăng nhập và role ADMIN
staffRouter.use(requireAuth, requireRole(ROLES.ADMIN));

registry.registerPath({
  method: 'get',
  path: '/admin/staff',
  summary: 'Get paginated list of staff members',
  tags: ['Admin: Staff'],
  security: [{ bearerAuth: [] }],
  request: {
    query: getStaffQuerySchema,
  },
  responses: {
    200: {
      description: 'List of staff members retrieved successfully',
      content: {
        'application/json': { schema: createPaginatedResponseSchema(staffResponseItemSchema) },
      },
    },
  },
});
staffRouter.get('/', validateQuery(getStaffQuerySchema), staffController.getStaffList);

registry.registerPath({
  method: 'post',
  path: '/admin/staff',
  summary: 'Create a new staff member',
  tags: ['Admin: Staff'],
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { 'application/json': { schema: createStaffBodySchema } } },
  },
  responses: {
    201: {
      description: 'Staff account created successfully',
      content: {
        'application/json': { schema: createSuccessResponseSchema(staffResponseDataSchema) },
      },
    },
    409: errorResponse(ERROR_CODES.EMAIL_ALREADY_EXISTS),
  },
});
staffRouter.post('/', validateBody(createStaffBodySchema), staffController.createStaff);

registry.registerPath({
  method: 'patch',
  path: '/admin/staff/{id}',
  summary: 'Update staff member status and info',
  tags: ['Admin: Staff'],
  security: [{ bearerAuth: [] }],
  request: {
    params: staffIdParamSchema,
    body: { content: { 'application/json': { schema: updateStaffStatusBodySchema } } },
  },
  responses: {
    200: {
      description: 'Staff updated successfully',
      content: {
        'application/json': { schema: createSuccessResponseSchema(staffResponseDataSchema) },
      },
    },
    400: errorResponse([
      ERROR_CODES.INVALID_TARGET_ROLE,
      ERROR_CODES.CANNOT_DEACTIVATE_LAST_ADMIN,
    ]),
    404: errorResponse(ERROR_CODES.STAFF_NOT_FOUND),
  },
});
staffRouter.patch(
  '/:id',
  validateParams(staffIdParamSchema),
  validateBody(updateStaffStatusBodySchema),
  staffController.updateStaffStatus,
);

registry.registerPath({
  method: 'put',
  path: '/admin/staff/{id}/permissions',
  summary: 'Update staff permissions',
  tags: ['Admin: Staff'],
  security: [{ bearerAuth: [] }],
  request: {
    params: staffIdParamSchema,
    body: { content: { 'application/json': { schema: updateStaffPermissionsBodySchema } } },
  },
  responses: {
    200: {
      description: 'Staff permissions updated successfully',
      content: {
        'application/json': { schema: createSuccessResponseSchema(staffResponseDataSchema) },
      },
    },
    400: errorResponse(ERROR_CODES.INVALID_TARGET_ROLE),
    404: errorResponse(ERROR_CODES.STAFF_NOT_FOUND),
  },
});
staffRouter.put(
  '/:id/permissions',
  validateParams(staffIdParamSchema),
  validateBody(updateStaffPermissionsBodySchema),
  staffController.updateStaffPermissions,
);
