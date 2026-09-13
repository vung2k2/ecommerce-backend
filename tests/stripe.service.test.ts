import { describe, expect, it, vi } from 'vitest';
import { stripeClient, stripeService } from '../src/services/stripe.service.js';

describe('Stripe Service Unit Tests', () => {
  it('creates checkout session with correct zero-decimal VND format and metadata', async () => {
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
      amount: 150000n,
      customerEmail: 'buyer@example.com',
      lineItems: [
        {
          name: 'iPhone 16 Pro Case',
          quantity: 2,
          unitAmount: 75000n,
        },
      ],
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
              unit_amount: 75000,
              product_data: {
                name: 'iPhone 16 Pro Case',
              },
            },
            quantity: 2,
          },
        ],
        metadata: {
          orderId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
          orderNumber: 'ORD-20260913-ABC',
          txnRef: 'ORD-20260913-ABC-1234',
        },
      }),
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
});
