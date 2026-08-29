import { Router } from 'express';
import { ERROR_CODES, PERMISSIONS } from '../../constants/index.js';
import {
  createPaginatedResponseSchema,
  createSuccessResponseSchema,
  errorResponse,
  registry,
} from '../../docs/registry.js';
import { z } from '../../utils/zod.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/permission.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middlewares/validate.middleware.js';
import { couponController } from './coupons.controller.js';
import {
  couponDetailResponseSchema,
  couponIdParamSchema,
  couponItemResponseSchema,
  createCouponSchema,
  listCouponsQuerySchema,
  updateCouponSchema,
  validateCouponResponseSchema,
  validateCouponSchema,
} from './coupons.schema.js';

export const customerCouponRouter = Router();
export const adminCouponRouter = Router();

//#region Routes

// Customer routes
customerCouponRouter.post(
  '/validate',
  requireAuth,
  validateBody(validateCouponSchema),
  couponController.validateCoupon,
);

// Admin routes
adminCouponRouter.get(
  '/',
  requireAuth,
  requirePermission(PERMISSIONS.COUPON_MANAGE),
  validateQuery(listCouponsQuerySchema),
  couponController.listCoupons,
);

adminCouponRouter.post(
  '/',
  requireAuth,
  requirePermission(PERMISSIONS.COUPON_MANAGE),
  validateBody(createCouponSchema),
  couponController.createCoupon,
);

adminCouponRouter.get(
  '/:id',
  requireAuth,
  requirePermission(PERMISSIONS.COUPON_MANAGE),
  validateParams(couponIdParamSchema),
  couponController.getCouponById,
);

adminCouponRouter.patch(
  '/:id',
  requireAuth,
  requirePermission(PERMISSIONS.COUPON_MANAGE),
  validateParams(couponIdParamSchema),
  validateBody(updateCouponSchema),
  couponController.updateCoupon,
);

adminCouponRouter.delete(
  '/:id',
  requireAuth,
  requirePermission(PERMISSIONS.COUPON_MANAGE),
  validateParams(couponIdParamSchema),
  couponController.deleteCoupon,
);

//#endregion

//#region Docs

registry.registerPath({
  method: 'post',
  path: '/coupons/validate',
  summary: "Validate and preview a coupon against user's active shopping cart",
  tags: ['Coupons'],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: validateCouponSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Coupon is valid, preview calculation returned',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(validateCouponResponseSchema),
        },
      },
    },
    404: errorResponse([ERROR_CODES.COUPON_NOT_FOUND, ERROR_CODES.CART_NOT_FOUND]),
    422: errorResponse([
      ERROR_CODES.CART_NO_AVAILABLE_ITEMS,
      ERROR_CODES.COUPON_INACTIVE,
      ERROR_CODES.COUPON_NOT_STARTED,
      ERROR_CODES.COUPON_EXPIRED,
      ERROR_CODES.COUPON_USAGE_LIMIT_EXCEEDED,
      ERROR_CODES.COUPON_USER_LIMIT_EXCEEDED,
      ERROR_CODES.COUPON_MIN_ORDER_NOT_MET,
    ]),
  },
});

registry.registerPath({
  method: 'get',
  path: '/admin/coupons',
  summary: 'List and filter coupons (Admin)',
  tags: ['Admin Coupons'],
  security: [{ bearerAuth: [] }],
  request: {
    query: listCouponsQuerySchema,
  },
  responses: {
    200: {
      description: 'Coupons list retrieved successfully',
      content: {
        'application/json': {
          schema: createPaginatedResponseSchema(couponItemResponseSchema),
        },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/admin/coupons',
  summary: 'Create a new coupon (Admin)',
  tags: ['Admin Coupons'],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: createCouponSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Coupon created successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(couponDetailResponseSchema),
        },
      },
    },
    409: errorResponse(ERROR_CODES.COUPON_CODE_EXISTS),
  },
});

registry.registerPath({
  method: 'get',
  path: '/admin/coupons/{id}',
  summary: 'Get coupon details by ID (Admin)',
  tags: ['Admin Coupons'],
  security: [{ bearerAuth: [] }],
  request: {
    params: couponIdParamSchema,
  },
  responses: {
    200: {
      description: 'Coupon details retrieved successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(couponDetailResponseSchema),
        },
      },
    },
    404: errorResponse(ERROR_CODES.COUPON_NOT_FOUND),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/admin/coupons/{id}',
  summary: 'Update coupon details (Admin)',
  tags: ['Admin Coupons'],
  security: [{ bearerAuth: [] }],
  request: {
    params: couponIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: updateCouponSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Coupon updated successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(couponDetailResponseSchema),
        },
      },
    },
    400: errorResponse([
      ERROR_CODES.INVALID_COUPON_DATES,
      ERROR_CODES.INVALID_COUPON_LIMITS,
    ]),
    404: errorResponse(ERROR_CODES.COUPON_NOT_FOUND),
    409: errorResponse(ERROR_CODES.COUPON_CODE_EXISTS),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/admin/coupons/{id}',
  summary: 'Delete coupon (Admin)',
  tags: ['Admin Coupons'],
  security: [{ bearerAuth: [] }],
  request: {
    params: couponIdParamSchema,
  },
  responses: {
    200: {
      description: 'Coupon deleted successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(
            z.object({
              message: z.string().openapi({ example: 'Coupon deleted successfully' }),
            }),
          ),
        },
      },
    },
    404: errorResponse(ERROR_CODES.COUPON_NOT_FOUND),
    409: errorResponse(ERROR_CODES.COUPON_CANNOT_DELETE_USED),
  },
});

//#endregion
