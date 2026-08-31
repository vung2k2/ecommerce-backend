import { Router } from 'express';
import { ERROR_CODES } from '../../constants/index.js';
import {
  createSuccessResponseSchema,
  errorResponse,
  registry,
} from '../../docs/registry.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { validateBody, validateQuery } from '../../middlewares/validate.middleware.js';
import { paymentController } from './payments.controller.js';
import {
  createPaymentUrlResponseSchema,
  createPaymentUrlSchema,
  vnpayIpnResponseSchema,
  vnpayReturnQuerySchema,
  vnpayReturnResponseSchema,
} from './payments.schema.js';

export const paymentsRouter = Router();

//#region Routes

paymentsRouter.post(
  '/vnpay/create',
  requireAuth,
  validateBody(createPaymentUrlSchema),
  paymentController.createPaymentUrl,
);

paymentsRouter.get(
  '/vnpay/return',
  validateQuery(vnpayReturnQuerySchema),
  paymentController.processReturnUrl,
);

paymentsRouter.get(
  '/vnpay/ipn',
  paymentController.processIpn,
);

//#endregion

//#region Docs

registry.registerPath({
  path: '/payments/vnpay/create',
  method: 'post',
  summary: 'Generate VNPay payment redirect URL for order',
  tags: ['Payments'],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: createPaymentUrlSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      description: 'VNPay payment redirect URL generated successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(createPaymentUrlResponseSchema),
        },
      },
    },
    404: errorResponse(ERROR_CODES.ORDER_NOT_FOUND),
    422: errorResponse(ERROR_CODES.PAYMENT_ORDER_NOT_PAYABLE),
  },
});

registry.registerPath({
  path: '/payments/vnpay/return',
  method: 'get',
  summary: 'Parse and verify VNPay payment return URL for client display',
  tags: ['Payments'],
  request: {
    query: vnpayReturnQuerySchema,
  },
  responses: {
    200: {
      description: 'VNPay return verification result',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(vnpayReturnResponseSchema),
        },
      },
    },
  },
});

registry.registerPath({
  path: '/payments/vnpay/ipn',
  method: 'get',
  summary: 'VNPay Server-to-Server IPN callback webhook',
  tags: ['Payments'],
  responses: {
    200: {
      description: 'Standard VNPay IPN response payload',
      content: {
        'application/json': {
          schema: vnpayIpnResponseSchema,
        },
      },
    },
  },
});

//#endregion
