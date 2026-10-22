import { describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../src/constants/index.js';
import { stripeClient, stripeService } from '../src/services/stripe.service.js';
import { AppError } from '../src/utils/app-error.js';

describe('Stripe Service Unit Tests', () => {
  it('charges a single aggregated VND line item equal to the final order amount', async () => {
    const mockSession = {
      id: 'cs_test_mock_123456',
      url: 'https://checkout.stripe.com/c/pay/cs_test_mock_123456',
    };

    const createSpy = vi
      .spyOn(stripeClient.checkout.sessions, 'create')
      .mockResolvedValue(mockSession as never);

    const result = await stripeService.createCheckoutSession({
      orderId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      orderNumber: 'ORD-20260913-ABC',
      amount: 135000n,
      idempotencyKey: 'checkout-session:ORD-20260913-ABC-1234',
      customerEmail: 'buyer@example.com',
      metadata: {
        txnRef: 'ORD-20260913-ABC-1234',
      },
    });

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        payment_method_types: ['card'],
        client_reference_id: 'ORD-20260913-ABC',
        customer_email: 'buyer@example.com',
        line_items: [
          {
            price_data: {
              currency: 'vnd',
              unit_amount: 135000,
              product_data: {
                name: 'Đơn hàng ORD-20260913-ABC',
              },
            },
            quantity: 1,
          },
        ],
        metadata: {
          orderId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
          orderNumber: 'ORD-20260913-ABC',
          txnRef: 'ORD-20260913-ABC-1234',
        },
      }),
      { idempotencyKey: 'checkout-session:ORD-20260913-ABC-1234' },
    );

    expect(result).toEqual({
      sessionId: 'cs_test_mock_123456',
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_mock_123456',
    });

    createSpy.mockRestore();
  });

  it('constructs webhook event with signature verification', () => {
    const mockEvent = {
      id: 'evt_test_123',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_mock_123456',
        },
      },
    };

    const constructSpy = vi
      .spyOn(stripeClient.webhooks, 'constructEvent')
      .mockReturnValue(mockEvent as never);

    const event = stripeService.constructWebhookEvent(
      Buffer.from('{"id":"evt_test_123"}'),
      'test_signature',
    );

    expect(constructSpy).toHaveBeenCalled();
    expect(event.type).toBe('checkout.session.completed');

    constructSpy.mockRestore();
  });

  it('maps webhook signature verification failures to a 400 AppError', () => {
    const constructSpy = vi
      .spyOn(stripeClient.webhooks, 'constructEvent')
      .mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature for payload');
      });

    let caught: unknown;
    try {
      stripeService.constructWebhookEvent(Buffer.from('{}'), 'bad_signature');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AppError);
    expect(caught).toMatchObject({
      statusCode: 400,
      code: ERROR_CODES.PAYMENT_CHECKSUM_INVALID,
    });

    constructSpy.mockRestore();
  });
});
