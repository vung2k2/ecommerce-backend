import { registry } from '../../docs/registry.js';
import { z } from '../../utils/zod.js';

// ==================== Request Schemas ====================

export const createStripeCheckoutSchema = z.object({
  orderId: z
    .string()
    .uuid('validation.orderIdUuid')
    .openapi({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6', description: 'Order UUID' }),
});
registry.register('CreateStripeCheckoutDto', createStripeCheckoutSchema);
export type CreateStripeCheckoutDto = z.infer<typeof createStripeCheckoutSchema>;

// ==================== Response Schemas ====================

export const createStripeCheckoutResponseSchema = z.object({
  sessionId: z.string().openapi({ example: 'cs_test_a1b2c3d4...' }),
  checkoutUrl: z.string().url().openapi({
    example: 'https://checkout.stripe.com/c/pay/cs_test_...',
    description: 'Direct redirect URL to Stripe Checkout page',
  }),
});

export const stripeWebhookResponseSchema = z.object({
  received: z.boolean().openapi({ example: true }),
});
