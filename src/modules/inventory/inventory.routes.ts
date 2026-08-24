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
import { inventoryController } from './inventory.controller.js';
import {
  adjustStockBodySchema,
  inventoryDetailResponseSchema,
  inventoryItemResponseSchema,
  listInventoryQuerySchema,
  listStockMovementsQuerySchema,
  restockBodySchema,
  stockMovementItemResponseSchema,
  variantIdParamSchema,
} from './inventory.schema.js';

export const inventoryRouter = Router();

//#region Routes

inventoryRouter.get(
  '/',
  requireAuth,
  requirePermission(PERMISSIONS.INVENTORY_READ),
  validateQuery(listInventoryQuerySchema),
  inventoryController.listInventories,
);

inventoryRouter.get(
  '/:variantId',
  requireAuth,
  requirePermission(PERMISSIONS.INVENTORY_READ),
  validateParams(variantIdParamSchema),
  inventoryController.getInventoryByVariantId,
);

inventoryRouter.get(
  '/:variantId/movements',
  requireAuth,
  requirePermission(PERMISSIONS.INVENTORY_READ),
  validateParams(variantIdParamSchema),
  validateQuery(listStockMovementsQuerySchema),
  inventoryController.getStockMovements,
);

inventoryRouter.post(
  '/:variantId/restock',
  requireAuth,
  requirePermission(PERMISSIONS.INVENTORY_WRITE),
  validateParams(variantIdParamSchema),
  validateBody(restockBodySchema),
  inventoryController.restock,
);

inventoryRouter.post(
  '/:variantId/adjust',
  requireAuth,
  requirePermission(PERMISSIONS.INVENTORY_WRITE),
  validateParams(variantIdParamSchema),
  validateBody(adjustStockBodySchema),
  inventoryController.adjustStock,
);

//#endregion

//#region Docs

registry.registerPath({
  method: 'get',
  path: '/admin/inventory',
  summary: 'List inventory items with stock levels',
  tags: ['Admin Inventory'],
  security: [{ bearerAuth: [] }],
  request: {
    query: listInventoryQuerySchema,
  },
  responses: {
    200: {
      description: 'Inventory items retrieved successfully',
      content: {
        'application/json': {
          schema: createPaginatedResponseSchema(inventoryItemResponseSchema),
        },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/admin/inventory/{variantId}',
  summary: 'Get inventory details for a variant',
  tags: ['Admin Inventory'],
  security: [{ bearerAuth: [] }],
  request: {
    params: variantIdParamSchema,
  },
  responses: {
    200: {
      description: 'Inventory details retrieved successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(inventoryDetailResponseSchema),
        },
      },
    },
    404: errorResponse([ERROR_CODES.VARIANT_NOT_FOUND, ERROR_CODES.INVENTORY_NOT_FOUND]),
  },
});

registry.registerPath({
  method: 'get',
  path: '/admin/inventory/{variantId}/movements',
  summary: 'Get stock movement audit ledger for a variant',
  tags: ['Admin Inventory'],
  security: [{ bearerAuth: [] }],
  request: {
    params: variantIdParamSchema,
    query: listStockMovementsQuerySchema,
  },
  responses: {
    200: {
      description: 'Stock movements retrieved successfully',
      content: {
        'application/json': {
          schema: createPaginatedResponseSchema(stockMovementItemResponseSchema),
        },
      },
    },
    404: errorResponse(ERROR_CODES.VARIANT_NOT_FOUND),
  },
});

registry.registerPath({
  method: 'post',
  path: '/admin/inventory/{variantId}/restock',
  summary: 'Restock inventory for a product variant',
  tags: ['Admin Inventory'],
  security: [{ bearerAuth: [] }],
  request: {
    params: variantIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: restockBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Inventory restocked successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(inventoryDetailResponseSchema),
        },
      },
    },
    404: errorResponse(ERROR_CODES.VARIANT_NOT_FOUND),
  },
});

registry.registerPath({
  method: 'post',
  path: '/admin/inventory/{variantId}/adjust',
  summary: 'Adjust on-hand inventory for a product variant',
  tags: ['Admin Inventory'],
  security: [{ bearerAuth: [] }],
  request: {
    params: variantIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: adjustStockBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Inventory adjusted successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(inventoryDetailResponseSchema),
        },
      },
    },
    404: errorResponse(ERROR_CODES.VARIANT_NOT_FOUND),
    422: errorResponse(ERROR_CODES.INVALID_STOCK_ADJUSTMENT),
  },
});

//#endregion
