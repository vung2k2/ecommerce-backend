import Stripe from 'stripe';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ERROR_CODES } from '../constants/index.js';
import { AppError } from '../utils/app-error.js';

export const stripeClient = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-02-24.acacia' as Stripe.LatestApiVersion,
  typescript: true,
});

export interface BuildStripeCheckoutInput {
  orderId: string;
  orderNumber: string;
  /** Số tiền cuối cùng cần thu (VND, đã trừ discount và cộng shipping). */
  amount: bigint;
  /** Stripe trả lại cùng session khi gọi lại với cùng key và cùng params. */
  idempotencyKey: string;
  customerEmail?: string | undefined;
  successUrl?: string | undefined;
  cancelUrl?: string | undefined;
  metadata?: Record<string, string> | undefined;
}

export interface StripeCheckoutResult {
  sessionId: string;
  checkoutUrl: string;
}

export const stripeService = {
  async createCheckoutSession(input: BuildStripeCheckoutInput): Promise<StripeCheckoutResult> {
    const successUrl =
      input.successUrl ?? `${env.STRIPE_SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = input.cancelUrl ?? env.STRIPE_CANCEL_URL;

    // Dùng 1 line item tổng hợp để số tiền Stripe thu luôn bằng order.totalAmount
    // (line item theo unitPrice sẽ bỏ qua discount/shipping).
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        price_data: {
          currency: 'vnd',
          unit_amount: Number(input.amount),
          product_data: {
            name: `Đơn hàng ${input.orderNumber}`,
          },
        },
        quantity: 1,
      },
    ];

    const session = await stripeClient.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        client_reference_id: input.orderNumber,
        ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
        line_items: lineItems,
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          orderId: input.orderId,
          orderNumber: input.orderNumber,
          ...input.metadata,
        },
      },
      { idempotencyKey: input.idempotencyKey },
    );

    if (!session.url) {
      throw new Error('Stripe failed to return checkout session URL');
    }

    return {
      sessionId: session.id,
      checkoutUrl: session.url,
    };
  },

  constructWebhookEvent(rawBody: Buffer | string, signature: string): Stripe.Event {
    try {
      return stripeClient.webhooks.constructEvent(
        rawBody,
        signature,
        env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (err) {
      logger.warn({ err }, 'Failed to verify Stripe webhook signature');
      throw new AppError(400, ERROR_CODES.PAYMENT_CHECKSUM_INVALID);
    }
  },
};
