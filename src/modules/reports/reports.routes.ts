import { Router } from 'express';
import { ERROR_CODES, PERMISSIONS } from '../../constants/index.js';
import { createSuccessResponseSchema, errorResponse, registry } from '../../docs/registry.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/permission.middleware.js';
import { validateQuery } from '../../middlewares/validate.middleware.js';
import { reportsController } from './reports.controller.js';
import {
  salesOverviewResponseSchema,
  salesReportQuerySchema,
  topProductsQuerySchema,
  topProductsResponseSchema,
} from './reports.schema.js';

export const adminReportRouter = Router();

// Toàn bộ endpoint trong reporting module yêu cầu xác thực và quyền report:read
adminReportRouter.use(requireAuth, requirePermission(PERMISSIONS.REPORT_READ));

//#region Routes

adminReportRouter.get(
  '/sales',
  validateQuery(salesReportQuerySchema),
  reportsController.getSalesReport,
);

adminReportRouter.get(
  '/top-products',
  validateQuery(topProductsQuerySchema),
  reportsController.getTopProductsReport,
);

//#endregion

//#region Docs

// GET /admin/reports/sales
registry.registerPath({
  method: 'get',
  path: '/admin/reports/sales',
  summary: 'Get delivered sales and revenue overview report',
  tags: ['Admin Reports'],
  security: [{ bearerAuth: [] }],
  request: {
    query: salesReportQuerySchema,
  },
  responses: {
    200: {
      description: 'Sales overview retrieved successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(salesOverviewResponseSchema),
        },
      },
    },
    400: errorResponse(ERROR_CODES.INVALID_REPORT_DATE_RANGE),
  },
});

// GET /admin/reports/top-products
registry.registerPath({
  method: 'get',
  path: '/admin/reports/top-products',
  summary: 'Get top selling products by units sold and revenue from delivered orders',
  tags: ['Admin Reports'],
  security: [{ bearerAuth: [] }],
  request: {
    query: topProductsQuerySchema,
  },
  responses: {
    200: {
      description: 'Top selling products retrieved successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(topProductsResponseSchema),
        },
      },
    },
    400: errorResponse(ERROR_CODES.INVALID_REPORT_DATE_RANGE),
  },
});

//#endregion
