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
import { orderController } from './orders.controller.js';
import {
  cancelOrderSchema,
  checkoutResponseSchema,
  checkoutSchema,
  listAdminOrdersQuerySchema,
  listCustomerOrdersQuerySchema,
  orderDetailResponseSchema,
  orderIdParamSchema,
  updateOrderStatusSchema,
} from './orders.schema.js';

export const checkoutRouter = Router();
export const customerOrderRouter = Router();
export const adminOrderRouter = Router();

//#region Routes

// --- Checkout Route ---
checkoutRouter.post(
  '/',
  requireAuth,
  validateBody(checkoutSchema),
  orderController.checkout,
);

// --- Customer Order Routes ---
customerOrderRouter.get(
  '/',
  requireAuth,
  validateQuery(listCustomerOrdersQuerySchema),
  orderController.getCustomerOrders,
);

customerOrderRouter.get(
  '/:id',
  requireAuth,
  validateParams(orderIdParamSchema),
  orderController.getCustomerOrderById,
);

customerOrderRouter.post(
  '/:id/cancel',
  requireAuth,
  validateParams(orderIdParamSchema),
  validateBody(cancelOrderSchema),
  orderController.cancelCustomerOrder,
);

// --- Admin Order Routes ---
adminOrderRouter.get(
  '/',
  requireAuth,
  requirePermission(PERMISSIONS.ORDER_READ),
  validateQuery(listAdminOrdersQuerySchema),
  orderController.listAdminOrders,
);

adminOrderRouter.get(
  '/:id',
  requireAuth,
  requirePermission(PERMISSIONS.ORDER_READ),
  validateParams(orderIdParamSchema),
  orderController.getAdminOrderById,
);

adminOrderRouter.patch(
  '/:id/status',
  requireAuth,
  requirePermission(PERMISSIONS.ORDER_UPDATE),
  validateParams(orderIdParamSchema),
  validateBody(updateOrderStatusSchema),
  orderController.updateAdminOrderStatus,
);

//#endregion

//#region Docs

// POST /checkout
registry.registerPath({
  method: 'post',
  path: '/checkout',
  summary: 'Checkout active shopping cart and place a new order',
  tags: ['Orders & Checkout'],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: checkoutSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Order placed successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(checkoutResponseSchema),
        },
      },
    },
    400: errorResponse(ERROR_CODES.ORDER_CART_EMPTY),
    404: errorResponse([ERROR_CODES.ADDRESS_NOT_FOUND, ERROR_CODES.COUPON_NOT_FOUND]),
    409: errorResponse(ERROR_CODES.INSUFFICIENT_STOCK),
    422: errorResponse([
      ERROR_CODES.ORDER_CART_ITEMS_UNAVAILABLE,
      ERROR_CODES.COUPON_INACTIVE,
      ERROR_CODES.COUPON_NOT_STARTED,
      ERROR_CODES.COUPON_EXPIRED,
      ERROR_CODES.COUPON_MIN_ORDER_NOT_MET,
      ERROR_CODES.COUPON_USAGE_LIMIT_EXCEEDED,
      ERROR_CODES.COUPON_USER_LIMIT_EXCEEDED,
    ]),
  },
});

// GET /orders
registry.registerPath({
  method: 'get',
  path: '/orders',
  summary: 'Get paginated list of orders for the authenticated customer',
  tags: ['Orders & Checkout'],
  security: [{ bearerAuth: [] }],
  request: {
    query: listCustomerOrdersQuerySchema,
  },
  responses: {
    200: {
      description: 'Customer orders retrieved successfully',
      content: {
        'application/json': {
          schema: createPaginatedResponseSchema(orderDetailResponseSchema),
        },
      },
    },
  },
});

// GET /orders/{id}
registry.registerPath({
  method: 'get',
  path: '/orders/{id}',
  summary: 'Get order details by ID for the authenticated customer',
  tags: ['Orders & Checkout'],
  security: [{ bearerAuth: [] }],
  request: {
    params: orderIdParamSchema,
  },
  responses: {
    200: {
      description: 'Order details retrieved successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(
            checkoutResponseSchema, // returns { order: orderDetailResponseSchema }
          ),
        },
      },
    },
    404: errorResponse(ERROR_CODES.ORDER_NOT_FOUND),
  },
});

// POST /orders/{id}/cancel
registry.registerPath({
  method: 'post',
  path: '/orders/{id}/cancel',
  summary: 'Cancel an order by ID (only when status is PENDING_PAYMENT or CONFIRMED)',
  tags: ['Orders & Checkout'],
  security: [{ bearerAuth: [] }],
  request: {
    params: orderIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: cancelOrderSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Order cancelled and stock released successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(checkoutResponseSchema),
        },
      },
    },
    404: errorResponse(ERROR_CODES.ORDER_NOT_FOUND),
    422: errorResponse(ERROR_CODES.ORDER_CANNOT_CANCEL),
  },
});

// GET /admin/orders
registry.registerPath({
  method: 'get',
  path: '/admin/orders',
  summary: 'Get paginated list of all orders for staff/admin',
  tags: ['Admin Orders'],
  security: [{ bearerAuth: [] }],
  request: {
    query: listAdminOrdersQuerySchema,
  },
  responses: {
    200: {
      description: 'Admin orders retrieved successfully',
      content: {
        'application/json': {
          schema: createPaginatedResponseSchema(orderDetailResponseSchema),
        },
      },
    },
  },
});

// GET /admin/orders/{id}
registry.registerPath({
  method: 'get',
  path: '/admin/orders/{id}',
  summary: 'Get order details by ID for staff/admin',
  tags: ['Admin Orders'],
  security: [{ bearerAuth: [] }],
  request: {
    params: orderIdParamSchema,
  },
  responses: {
    200: {
      description: 'Admin order details retrieved successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(checkoutResponseSchema),
        },
      },
    },
    404: errorResponse(ERROR_CODES.ORDER_NOT_FOUND),
  },
});

// PATCH /admin/orders/{id}/status
registry.registerPath({
  method: 'patch',
  path: '/admin/orders/{id}/status',
  summary: 'Update order status with state transition validation and stock orchestration',
  tags: ['Admin Orders'],
  security: [{ bearerAuth: [] }],
  request: {
    params: orderIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: updateOrderStatusSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Order status updated successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(checkoutResponseSchema),
        },
      },
    },
    404: errorResponse(ERROR_CODES.ORDER_NOT_FOUND),
    422: errorResponse(ERROR_CODES.ORDER_INVALID_STATE_TRANSITION),
  },
});

//#endregion
