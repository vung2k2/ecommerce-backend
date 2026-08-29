import { Router } from 'express';
import { ERROR_CODES } from '../../constants/index.js';
import {
  createSuccessResponseSchema,
  errorResponse,
  registry,
} from '../../docs/registry.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { validateBody, validateParams } from '../../middlewares/validate.middleware.js';
import { cartController } from './cart.controller.js';
import {
  addToCartSchema,
  cartItemParamsSchema,
  cartResponseSchema,
  updateCartItemSchema,
} from './cart.schema.js';

export const cartRouter = Router();

//#region Routes

cartRouter.get('/', requireAuth, cartController.getCart);

cartRouter.post(
  '/items',
  requireAuth,
  validateBody(addToCartSchema),
  cartController.addItem,
);

cartRouter.patch(
  '/items/:itemId',
  requireAuth,
  validateParams(cartItemParamsSchema),
  validateBody(updateCartItemSchema),
  cartController.updateItemQuantity,
);

cartRouter.delete(
  '/items/:itemId',
  requireAuth,
  validateParams(cartItemParamsSchema),
  cartController.removeItem,
);

cartRouter.delete('/', requireAuth, cartController.clearCart);

//#endregion

//#region Docs

registry.registerPath({
  method: 'get',
  path: '/cart',
  summary: "Get current user's active shopping cart",
  tags: ['Cart'],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'Shopping cart retrieved successfully with live pricing and availability status',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(cartResponseSchema),
        },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/cart/items',
  summary: 'Add an item incrementally to shopping cart',
  tags: ['Cart'],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: addToCartSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Item added to cart successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(cartResponseSchema),
        },
      },
    },
    404: errorResponse(ERROR_CODES.VARIANT_NOT_FOUND),
    422: errorResponse([
      ERROR_CODES.VARIANT_INACTIVE,
      ERROR_CODES.INSUFFICIENT_STOCK,
      ERROR_CODES.CART_ITEM_QUANTITY_INVALID,
    ]),
  },
});

registry.registerPath({
  method: 'patch',
  path: '/cart/items/{itemId}',
  summary: 'Update quantity of an existing cart item',
  tags: ['Cart'],
  security: [{ bearerAuth: [] }],
  request: {
    params: cartItemParamsSchema,
    body: {
      content: {
        'application/json': {
          schema: updateCartItemSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Cart item quantity updated successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(cartResponseSchema),
        },
      },
    },
    404: errorResponse([ERROR_CODES.CART_ITEM_NOT_FOUND, ERROR_CODES.VARIANT_NOT_FOUND]),
    422: errorResponse([
      ERROR_CODES.VARIANT_INACTIVE,
      ERROR_CODES.CART_ITEM_QUANTITY_INVALID,
    ]),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/cart/items/{itemId}',
  summary: 'Remove an item from shopping cart',
  tags: ['Cart'],
  security: [{ bearerAuth: [] }],
  request: {
    params: cartItemParamsSchema,
  },
  responses: {
    200: {
      description: 'Item removed from cart successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(cartResponseSchema),
        },
      },
    },
    404: errorResponse(ERROR_CODES.CART_ITEM_NOT_FOUND),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/cart',
  summary: 'Clear all items from shopping cart',
  tags: ['Cart'],
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'Shopping cart cleared successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(cartResponseSchema),
        },
      },
    },
  },
});

//#endregion
