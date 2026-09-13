import { Router } from 'express';
import { ERROR_CODES } from '../../constants/index.js';
import {
  createSuccessResponseSchema,
  errorResponse,
  registry,
} from '../../docs/registry.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { paymentController } from './payments.controller.js';
import {
  createStripeCheckoutResponseSchema,
  createStripeCheckoutSchema,
  stripeWebhookResponseSchema,
} from './payments.schema.js';

export const paymentsRouter = Router();

//#region Routes

paymentsRouter.post(
  '/stripe/create',
  requireAuth,
  validateBody(createStripeCheckoutSchema),
  paymentController.createStripeCheckout,
);

paymentsRouter.post(
  '/stripe/webhook',
  paymentController.handleStripeWebhook,
);

//#endregion

//#region Docs

registry.registerPath({
  path: '/payments/stripe/create',
  method: 'post',
  summary: 'Generate Stripe Checkout Session URL for order',
  tags: ['Payments'],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: createStripeCheckoutSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      description: 'Stripe Checkout Session URL generated successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(createStripeCheckoutResponseSchema),
        },
      },
    },
    404: errorResponse(ERROR_CODES.ORDER_NOT_FOUND),
    422: errorResponse(ERROR_CODES.PAYMENT_ORDER_NOT_PAYABLE),
  },
});

registry.registerPath({
  path: '/payments/stripe/webhook',
  method: 'post',
  summary: 'Stripe webhook event listener callback',
  tags: ['Payments'],
  responses: {
    200: {
      description: 'Stripe webhook event acknowledged',
      content: {
        'application/json': {
          schema: stripeWebhookResponseSchema,
        },
      },
    },
  },
});

//#endregion
