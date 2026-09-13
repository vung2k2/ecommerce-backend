import bcrypt from 'bcrypt';
import request from 'supertest';
import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import {
  AUDIT_ACTIONS,
  ERROR_CODES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PAYMENT_TRANSACTION_STATUSES,
  ROLES,
} from '../src/constants/index.js';
import { prisma } from '../src/database/prisma.js';
import { stripeClient } from '../src/services/stripe.service.js';
import { jwtService } from '../src/utils/jwt.js';

// ==================== Response Schemas ====================

const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

const createStripeCheckoutResponseSchema = z.object({
  data: z.object({
    sessionId: z.string(),
    checkoutUrl: z.string(),
  }),
});

describe('Stripe Payments Integration Tests', () => {
  const app = createApp();

  let customer1Token: string;
  let customer1Id: string;
  let customer2Token: string;

  let testCategory: { id: string };
  let testProduct: { id: string };
  let testVariant: { id: string; price: bigint; sku: string };

  let stripeOrder: { id: string; orderNumber: string; totalAmount: bigint };

  beforeEach(async () => {
    vi.restoreAllMocks();

    // Clear test tables
    await prisma.auditLog.deleteMany();
    await prisma.paymentTransaction.deleteMany();
    await prisma.orderStatusHistory.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.couponUsage.deleteMany();
    await prisma.order.deleteMany();
    await prisma.coupon.deleteMany();
    await prisma.cartItem.deleteMany();
    await prisma.cart.deleteMany();
    await prisma.stockMovement.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.productSpecification.deleteMany();
    await prisma.productImage.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.brand.deleteMany();
    await prisma.address.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.userPermission.deleteMany();
    await prisma.user.deleteMany();

    const passwordHash = await bcrypt.hash('Password123!', 10);

    // Create Customer 1
    const customer1 = await prisma.user.create({
      data: {
        email: 'customer1@stripe-test.com',
        passwordHash,
        fullName: 'Customer One',
        role: ROLES.CUSTOMER,
      },
    });
    customer1Id = customer1.id;
    customer1Token = jwtService.signAccessToken({
      userId: customer1.id,
      role: customer1.role,
    });

    // Create Customer 2
    const customer2 = await prisma.user.create({
      data: {
        email: 'customer2@stripe-test.com',
        passwordHash,
        fullName: 'Customer Two',
        role: ROLES.CUSTOMER,
      },
    });
    customer2Token = jwtService.signAccessToken({
      userId: customer2.id,
      role: customer2.role,
    });

    // Create Category & Product & Variant
    testCategory = await prisma.category.create({
      data: { name: 'Phones', slug: 'phones' },
    });

    testProduct = await prisma.product.create({
      data: {
        name: 'iPhone 16 Pro',
        slug: 'iphone-16-pro',
        status: 'ACTIVE',
        categoryId: testCategory.id,
      },
    });

    testVariant = await prisma.productVariant.create({
      data: {
        productId: testProduct.id,
        sku: 'IP16PRO-256',
        name: 'iPhone 16 Pro 256GB',
        price: 25000000n, // 25,000,000 VND
        isActive: true,
      },
    });

    // Inventory: 10 on-hand, 2 reserved for our test order
    const inv = await prisma.inventory.create({
      data: {
        variantId: testVariant.id,
        onHand: 10,
        reserved: 2,
      },
    });

    await prisma.stockMovement.create({
      data: {
        inventoryId: inv.id,
        type: 'RESERVE',
        onHandChange: 0,
        reservedChange: 2,
        balanceAfterOnHand: 10,
        balanceAfterReserved: 2,
        reason: 'Reserve stock for order ORD-20260913-STRIPE1',
        referenceType: 'ORDER',
        referenceId: 'ORD-20260913-STRIPE1',
        actorId: customer1Id,
      },
    });

    // Create a PENDING_PAYMENT Order for Stripe
    stripeOrder = await prisma.order.create({
      data: {
        orderNumber: 'ORD-20260913-STRIPE1',
        userId: customer1Id,
        status: ORDER_STATUSES.PENDING_PAYMENT,
        paymentMethod: PAYMENT_METHODS.STRIPE,
        paymentStatus: PAYMENT_STATUSES.PENDING,
        subtotalAmount: 50000000n,
        discountAmount: 0n,
        shippingFee: 0n,
        totalAmount: 50000000n,
        recipientName: 'Customer One',
        phone: '0987654321',
        province: 'TP. Ho Chi Minh',
        district: 'Quan 1',
        ward: 'Phuong Ben Nghe',
        streetAddress: '123 Le Loi',
        items: {
          create: [
            {
              variantId: testVariant.id,
              productName: 'iPhone 16 Pro',
              sku: 'IP16PRO-256',
              unitPrice: 25000000n,
              quantity: 2,
              totalPrice: 50000000n,
            },
          ],
        },
        statusHistory: {
          create: {
            fromStatus: null,
            toStatus: ORDER_STATUSES.PENDING_PAYMENT,
            reason: 'Order placed awaiting payment',
            changedById: customer1Id,
          },
        },
      },
    });
  });

  // ==================== 1. Create Stripe Checkout Session ====================
  describe('POST /api/v1/payments/stripe/create', () => {
    it('creates Stripe checkout session URL for eligible order and saves PaymentTransaction record', async () => {
      const mockSession = {
        id: 'cs_test_session_123',
        url: 'https://checkout.stripe.com/c/pay/cs_test_session_123',
      };

      vi.spyOn(stripeClient.checkout.sessions, 'create').mockResolvedValue(
        mockSession as never,
      );

      const res = await request(app)
        .post('/api/v1/payments/stripe/create')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ orderId: stripeOrder.id });

      expect(res.status).toBe(201);
      const parsed = createStripeCheckoutResponseSchema.parse(res.body);
      expect(parsed.data.sessionId).toBe('cs_test_session_123');
      expect(parsed.data.checkoutUrl).toBe('https://checkout.stripe.com/c/pay/cs_test_session_123');

      // Verify transaction was stored in DB
      const transaction = await prisma.paymentTransaction.findFirst({
        where: { orderId: stripeOrder.id },
      });
      expect(transaction).not.toBeNull();
      expect(transaction?.paymentMethod).toBe(PAYMENT_METHODS.STRIPE);
      expect(transaction?.status).toBe(PAYMENT_TRANSACTION_STATUSES.PENDING);
      expect(transaction?.transactionNo).toBe('cs_test_session_123');

      // Verify Audit Log
      const audit = await prisma.auditLog.findFirst({
        where: { action: AUDIT_ACTIONS.CHECKOUT_SESSION_CREATED, targetId: stripeOrder.id },
      });
      expect(audit).not.toBeNull();
      expect(audit?.actorId).toBe(customer1Id);
    });

    it('returns 404 if order belongs to another customer', async () => {
      const res = await request(app)
        .post('/api/v1/payments/stripe/create')
        .set('Authorization', `Bearer ${customer2Token}`)
        .send({ orderId: stripeOrder.id });

      expect(res.status).toBe(404);
      const parsed = errorResponseSchema.parse(res.body);
      expect(parsed.error.code).toBe(ERROR_CODES.ORDER_NOT_FOUND);
    });

    it('returns 422 if order is not in PENDING_PAYMENT status', async () => {
      await prisma.order.update({
        where: { id: stripeOrder.id },
        data: { status: ORDER_STATUSES.CANCELLED },
      });

      const res = await request(app)
        .post('/api/v1/payments/stripe/create')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ orderId: stripeOrder.id });

      expect(res.status).toBe(422);
      const parsed = errorResponseSchema.parse(res.body);
      expect(parsed.error.code).toBe(ERROR_CODES.PAYMENT_ORDER_NOT_PAYABLE);
    });

    it('returns 401 if unauthenticated', async () => {
      const res = await request(app)
        .post('/api/v1/payments/stripe/create')
        .send({ orderId: stripeOrder.id });

      expect(res.status).toBe(401);
    });
  });

  // ==================== 2. Stripe Webhook Handling ====================
  describe('POST /api/v1/payments/stripe/webhook', () => {
    it('rejects request with 400 when webhook signature is invalid', async () => {
      vi.spyOn(stripeClient.webhooks, 'constructEvent').mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const res = await request(app)
        .post('/api/v1/payments/stripe/webhook')
        .set('stripe-signature', 'invalid_signature')
        .send({ id: 'evt_test' });

      expect(res.status).toBe(500);
    });

    it('processes checkout.session.completed: updates order to CONFIRMED, payment to PAID, and commits stock', async () => {
      const txnRef = `${stripeOrder.orderNumber}-test1`;
      await prisma.paymentTransaction.create({
        data: {
          orderId: stripeOrder.id,
          paymentMethod: PAYMENT_METHODS.STRIPE,
          txnRef,
          amount: stripeOrder.totalAmount,
          status: PAYMENT_TRANSACTION_STATUSES.PENDING,
        },
      });

      const mockEvent: Stripe.Event = {
        id: 'evt_test_completed_1',
        object: 'event',
        api_version: '2025-02-24.acacia',
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        pending_webhooks: 0,
        request: null,
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_completed_1',
            object: 'checkout.session',
            payment_status: 'paid',
            metadata: {
              orderId: stripeOrder.id,
              orderNumber: stripeOrder.orderNumber,
              txnRef,
            },
          } as unknown as Stripe.Checkout.Session,
        },
      };

      vi.spyOn(stripeClient.webhooks, 'constructEvent').mockReturnValue(mockEvent);

      const res = await request(app)
        .post('/api/v1/payments/stripe/webhook')
        .set('stripe-signature', 'valid_sig')
        .send({ id: 'evt_test_completed_1' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });

      // Order should be CONFIRMED and PAID
      const updatedOrder = await prisma.order.findUnique({ where: { id: stripeOrder.id } });
      expect(updatedOrder?.status).toBe(ORDER_STATUSES.CONFIRMED);
      expect(updatedOrder?.paymentStatus).toBe(PAYMENT_STATUSES.PAID);

      // Inventory should be committed: onHand decreased from 10 to 8, reserved decreased from 2 to 0
      const inventory = await prisma.inventory.findFirst({
        where: { variantId: testVariant.id },
      });
      expect(inventory?.onHand).toBe(8);
      expect(inventory?.reserved).toBe(0);

      // StockMovement COMMIT should be recorded
      const commitMovement = await prisma.stockMovement.findFirst({
        where: {
          type: 'COMMIT',
          referenceId: stripeOrder.orderNumber,
        },
      });
      expect(commitMovement).not.toBeNull();
      expect(commitMovement?.onHandChange).toBe(-2);
      expect(commitMovement?.reservedChange).toBe(-2);

      // Transaction status updated
      const paymentTx = await prisma.paymentTransaction.findUnique({
        where: { txnRef },
      });
      expect(paymentTx?.status).toBe(PAYMENT_TRANSACTION_STATUSES.SUCCESS);
      expect(paymentTx?.transactionNo).toBe('cs_test_completed_1');

      // Audit Log recorded
      const audit = await prisma.auditLog.findFirst({
        where: { action: AUDIT_ACTIONS.PAYMENT_WEBHOOK_PROCESSED, targetId: stripeOrder.id },
      });
      expect(audit).not.toBeNull();
    });

    it('handles idempotent duplicate checkout.session.completed events without duplicating stock commits', async () => {
      const txnRef = `${stripeOrder.orderNumber}-test-idemp`;
      await prisma.paymentTransaction.create({
        data: {
          orderId: stripeOrder.id,
          paymentMethod: PAYMENT_METHODS.STRIPE,
          txnRef,
          amount: stripeOrder.totalAmount,
          status: PAYMENT_TRANSACTION_STATUSES.PENDING,
        },
      });

      const mockEvent: Stripe.Event = {
        id: 'evt_test_idemp',
        object: 'event',
        api_version: '2025-02-24.acacia',
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        pending_webhooks: 0,
        request: null,
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_idemp',
            object: 'checkout.session',
            payment_status: 'paid',
            metadata: {
              orderId: stripeOrder.id,
              orderNumber: stripeOrder.orderNumber,
              txnRef,
            },
          } as unknown as Stripe.Checkout.Session,
        },
      };

      vi.spyOn(stripeClient.webhooks, 'constructEvent').mockReturnValue(mockEvent);

      // First webhook call
      const res1 = await request(app)
        .post('/api/v1/payments/stripe/webhook')
        .set('stripe-signature', 'valid_sig')
        .send({ id: 'evt_test_idemp' });
      expect(res1.status).toBe(200);

      // Second identical webhook call
      const res2 = await request(app)
        .post('/api/v1/payments/stripe/webhook')
        .set('stripe-signature', 'valid_sig')
        .send({ id: 'evt_test_idemp' });
      expect(res2.status).toBe(200);

      // Ensure inventory wasn't decremented twice
      const inventory = await prisma.inventory.findFirst({
        where: { variantId: testVariant.id },
      });
      expect(inventory?.onHand).toBe(8);
      expect(inventory?.reserved).toBe(0);

      const commitMovements = await prisma.stockMovement.findMany({
        where: { type: 'COMMIT', referenceId: stripeOrder.orderNumber },
      });
      expect(commitMovements).toHaveLength(1);
    });

    it('processes checkout.session.expired: marks order PAYMENT_EXPIRED and releases reserved inventory', async () => {
      const txnRef = `${stripeOrder.orderNumber}-test-exp`;
      await prisma.paymentTransaction.create({
        data: {
          orderId: stripeOrder.id,
          paymentMethod: PAYMENT_METHODS.STRIPE,
          txnRef,
          amount: stripeOrder.totalAmount,
          status: PAYMENT_TRANSACTION_STATUSES.PENDING,
        },
      });

      const mockEvent: Stripe.Event = {
        id: 'evt_test_expired_1',
        object: 'event',
        api_version: '2025-02-24.acacia',
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        pending_webhooks: 0,
        request: null,
        type: 'checkout.session.expired',
        data: {
          object: {
            id: 'cs_test_expired_1',
            object: 'checkout.session',
            metadata: {
              orderId: stripeOrder.id,
              orderNumber: stripeOrder.orderNumber,
              txnRef,
            },
          } as unknown as Stripe.Checkout.Session,
        },
      };

      vi.spyOn(stripeClient.webhooks, 'constructEvent').mockReturnValue(mockEvent);

      const res = await request(app)
        .post('/api/v1/payments/stripe/webhook')
        .set('stripe-signature', 'valid_sig')
        .send({ id: 'evt_test_expired_1' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });

      // Order marked PAYMENT_EXPIRED
      const updatedOrder = await prisma.order.findUnique({ where: { id: stripeOrder.id } });
      expect(updatedOrder?.status).toBe(ORDER_STATUSES.PAYMENT_EXPIRED);
      expect(updatedOrder?.paymentStatus).toBe(PAYMENT_STATUSES.EXPIRED);

      // Reserved stock released: onHand remains 10, reserved becomes 0
      const inventory = await prisma.inventory.findFirst({
        where: { variantId: testVariant.id },
      });
      expect(inventory?.onHand).toBe(10);
      expect(inventory?.reserved).toBe(0);

      // Release stock movement created
      const releaseMovement = await prisma.stockMovement.findFirst({
        where: { type: 'RELEASE', referenceId: stripeOrder.orderNumber },
      });
      expect(releaseMovement).not.toBeNull();
      expect(releaseMovement?.reservedChange).toBe(-2);
    });
  });
});
