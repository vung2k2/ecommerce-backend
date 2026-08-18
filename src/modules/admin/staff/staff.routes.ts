import { Router } from 'express';
import { ROLES } from '../../../constants/index.js';
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
  staffIdParamSchema,
  updateStaffPermissionsBodySchema,
  updateStaffStatusBodySchema,
} from './staff.schema.js';

export const staffRouter = Router();

// Toàn bộ route trong module quản lý staff yêu cầu đăng nhập và role ADMIN
staffRouter.use(requireAuth, requireRole(ROLES.ADMIN));

staffRouter.get('/', validateQuery(getStaffQuerySchema), staffController.getStaffList);
staffRouter.post('/', validateBody(createStaffBodySchema), staffController.createStaff);
staffRouter.patch(
  '/:id',
  validateParams(staffIdParamSchema),
  validateBody(updateStaffStatusBodySchema),
  staffController.updateStaffStatus,
);
staffRouter.put(
  '/:id/permissions',
  validateParams(staffIdParamSchema),
  validateBody(updateStaffPermissionsBodySchema),
  staffController.updateStaffPermissions,
);
