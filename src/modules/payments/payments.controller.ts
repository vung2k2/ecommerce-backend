import type { RequestHandler } from 'express';
import { sendSuccess } from '../../utils/response.js';
import type { CreateStripeCheckoutDto } from './payments.schema.js';
import { paymentService } from './payments.service.js';

export const paymentController = {
  createStripeCheckout: (async (req, res) => {
    const userId = req.user.userId;
    const result = await paymentService.createStripeCheckoutSession(userId, req.body);
    return sendSuccess(res, result, 201);
  }) as RequestHandler<unknown, unknown, CreateStripeCheckoutDto>,

  handleStripeWebhook: (async (req, res) => {
    const signature = (req.headers['stripe-signature'] as string) || '';
    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody || (req.body as Buffer);
    const result = await paymentService.handleStripeWebhook(rawBody, signature);
    return res.status(200).json(result);
  }) as RequestHandler,
};
