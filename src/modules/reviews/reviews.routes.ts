import { Router } from 'express';
import { ERROR_CODES, PERMISSIONS } from '../../constants/index.js';
import {
  createPaginatedResponseSchema,
  createSuccessResponseSchema,
  errorResponse,
  registry,
} from '../../docs/registry.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/permission.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middlewares/validate.middleware.js';
import { z } from '../../utils/zod.js';
import { reviewsController } from './reviews.controller.js';
import {
  adminReviewItemSchema,
  createReviewSchema,
  listAdminReviewsQuerySchema,
  listProductReviewsQuerySchema,
  moderateReviewSchema,
  productIdParamSchema,
  productReviewsDataSchema,
  productReviewItemSchema,
  reviewIdParamSchema,
} from './reviews.schema.js';

export const productReviewRouter = Router();
export const adminReviewRouter = Router();

//#region Routes

// --- Product Reviews (Public & Customer) ---
productReviewRouter.get(
  '/:productId/reviews',
  validateParams(productIdParamSchema),
  validateQuery(listProductReviewsQuerySchema),
  reviewsController.getProductReviews,
);

productReviewRouter.post(
  '/:productId/reviews',
  requireAuth,
  validateParams(productIdParamSchema),
  validateBody(createReviewSchema),
  reviewsController.createReview,
);

// --- Admin Review Moderation ---
adminReviewRouter.get(
  '/',
  requireAuth,
  requirePermission(PERMISSIONS.REVIEW_MODERATE),
  validateQuery(listAdminReviewsQuerySchema),
  reviewsController.listAdminReviews,
);

adminReviewRouter.patch(
  '/:id/moderate',
  requireAuth,
  requirePermission(PERMISSIONS.REVIEW_MODERATE),
  validateParams(reviewIdParamSchema),
  validateBody(moderateReviewSchema),
  reviewsController.moderateReview,
);

//#endregion

//#region Docs

// GET /products/{productId}/reviews
registry.registerPath({
  method: 'get',
  path: '/products/{productId}/reviews',
  summary: 'Get paginated reviews and rating summary for a product',
  tags: ['Reviews'],
  request: {
    params: productIdParamSchema,
    query: listProductReviewsQuerySchema,
  },
  responses: {
    200: {
      description: 'Reviews and rating summary retrieved successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(productReviewsDataSchema),
        },
      },
    },
  },
});

// POST /products/{productId}/reviews
registry.registerPath({
  method: 'post',
  path: '/products/{productId}/reviews',
  summary: 'Create a review for a delivered product order item',
  tags: ['Reviews'],
  security: [{ bearerAuth: [] }],
  request: {
    params: productIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: createReviewSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Review created successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(
            z.object({
              review: productReviewItemSchema,
            }),
          ),
        },
      },
    },
    400: errorResponse(ERROR_CODES.ORDER_NOT_DELIVERED),
    404: errorResponse(ERROR_CODES.ORDER_ITEM_NOT_FOUND),
    409: errorResponse(ERROR_CODES.REVIEW_ALREADY_EXISTS),
  },
});

// GET /admin/reviews
registry.registerPath({
  method: 'get',
  path: '/admin/reviews',
  summary: 'List reviews for moderation (Admin/Staff with review:moderate)',
  tags: ['Admin Reviews'],
  security: [{ bearerAuth: [] }],
  request: {
    query: listAdminReviewsQuerySchema,
  },
  responses: {
    200: {
      description: 'Reviews retrieved successfully',
      content: {
        'application/json': {
          schema: createPaginatedResponseSchema(adminReviewItemSchema),
        },
      },
    },
  },
});

// PATCH /admin/reviews/{id}/moderate
registry.registerPath({
  method: 'patch',
  path: '/admin/reviews/{id}/moderate',
  summary: 'Moderate a review visibility (hide or unhide with reason)',
  tags: ['Admin Reviews'],
  security: [{ bearerAuth: [] }],
  request: {
    params: reviewIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: moderateReviewSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Review moderated successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(
            z.object({
              review: adminReviewItemSchema,
            }),
          ),
        },
      },
    },
    404: errorResponse(ERROR_CODES.REVIEW_NOT_FOUND),
  },
});

//#endregion
