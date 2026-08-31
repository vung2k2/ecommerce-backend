import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
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
import { sortObject } from '../src/services/vnpay.service.js';
import { jwtService } from '../src/utils/jwt.js';

// ==================== Response Schemas ====================

const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

const createPaymentUrlResponseSchema = z.object({
  data: z.object({
    paymentUrl: z.string(),
    txnRef: z.string(),
  }),
});

const vnpayReturnResponseSchema = z.object({
  data: z.object({
    isSuccess: z.boolean(),
    orderNumber: z.string().nullable(),
    responseCode: z.string(),
    transactionNo: z.string().nullable(),
    amount: z.string(),
    message: z.string(),
  }),
});

const ipnResponseSchema = z.object({
  RspCode: z.string(),
  Message: z.string(),
});

function signVnPayParams(params: Record<string, string>): {
  signedQuery: Record<string, string>;
  secureHash: string;
} {
  const sorted = sortObject(params);
  const signData = Object.entries(sorted)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  const hmac = crypto.createHmac('sha512', env.VNPAY_HASH_SECRET);
  const secureHash = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

  return {
    signedQuery: {
      ...params,
      vnp_SecureHash: secureHash,
    },
    secureHash,
  };
}

describe('VNPay Module Integration Tests', () => {
  const app = createApp();

  let customer1Token: string;
  let customer1Id: string;
  let customer2Token: string;

  let testCategory: { id: string };
  let testProduct: { id: string };
  let testVariant: { id: string; price: bigint; sku: string };

  let vnpayOrder: { id: string; orderNumber: string; totalAmount: bigint };

  beforeEach(async () => {
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
        email: 'customer1@vnpay-test.com',
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
        email: 'customer2@vnpay-test.com',
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
        reason: 'Reserve stock for order ORD-20260831-VNPAY1',
        referenceType: 'ORDER',
        referenceId: 'ORD-20260831-VNPAY1',
        actorId: customer1Id,
      },
    });

    // Create a PENDING_PAYMENT Order for VNPay
    vnpayOrder = await prisma.order.create({
      data: {
        orderNumber: 'ORD-20260831-VNPAY1',
        userId: customer1Id,
        status: ORDER_STATUSES.PENDING_PAYMENT,
        paymentMethod: PAYMENT_METHODS.VNPAY,
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

  // ==================== 1. Create VNPay Payment URL ====================

  describe('POST /api/v1/payments/vnpay/create', () => {
    it('creates VNPay payment URL for eligible order and saves PaymentTransaction record', async () => {
      const res = await request(app)
        .post('/api/v1/payments/vnpay/create')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          orderId: vnpayOrder.id,
          bankCode: 'NCB',
          language: 'vn',
        });

      expect(res.status).toBe(201);
      const parsed = createPaymentUrlResponseSchema.parse(res.body);
      expect(parsed.data.paymentUrl).toContain('vnp_Amount=5000000000'); // 50,000,000 * 100
      expect(parsed.data.paymentUrl).toContain('vnp_BankCode=NCB');
      expect(parsed.data.txnRef).toContain(vnpayOrder.orderNumber);

      // Verify DB PaymentTransaction
      const txn = await prisma.paymentTransaction.findUnique({
        where: { txnRef: parsed.data.txnRef },
      });
      expect(txn).not.toBeNull();
      expect(txn?.status).toBe(PAYMENT_TRANSACTION_STATUSES.PENDING);
      expect(txn?.amount).toBe(50000000n);
      expect(txn?.bankCode).toBe('NCB');

      // Verify Audit Log
      const audit = await prisma.auditLog.findFirst({
        where: { action: AUDIT_ACTIONS.PAYMENT_URL_CREATED, targetId: vnpayOrder.id },
      });
      expect(audit).not.toBeNull();
    });

    it('rejects payment URL creation if order does not belong to user', async () => {
      const res = await request(app)
        .post('/api/v1/payments/vnpay/create')
        .set('Authorization', `Bearer ${customer2Token}`) // customer 2
        .send({
          orderId: vnpayOrder.id,
        });

      expect(res.status).toBe(404);
      const parsed = errorResponseSchema.parse(res.body);
      expect(parsed.error.code).toBe(ERROR_CODES.ORDER_NOT_FOUND);
    });

    it('rejects payment URL creation if order is already CONFIRMED', async () => {
      // Transition order to CONFIRMED
      await prisma.order.update({
        where: { id: vnpayOrder.id },
        data: { status: ORDER_STATUSES.CONFIRMED },
      });

      const res = await request(app)
        .post('/api/v1/payments/vnpay/create')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          orderId: vnpayOrder.id,
        });

      expect(res.status).toBe(422);
      const parsed = errorResponseSchema.parse(res.body);
      expect(parsed.error.code).toBe(ERROR_CODES.PAYMENT_ORDER_NOT_PAYABLE);
    });

    it('reuses existing active pending transaction within 15 minutes', async () => {
      const res1 = await request(app)
        .post('/api/v1/payments/vnpay/create')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ orderId: vnpayOrder.id });

      expect(res1.status).toBe(201);
      const parsed1 = createPaymentUrlResponseSchema.parse(res1.body);

      const res2 = await request(app)
        .post('/api/v1/payments/vnpay/create')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ orderId: vnpayOrder.id });

      expect(res2.status).toBe(201);
      const parsed2 = createPaymentUrlResponseSchema.parse(res2.body);

      expect(parsed2.data.txnRef).toBe(parsed1.data.txnRef);
    });
  });

  // ==================== 2. VNPay Return URL ====================

  describe('GET /api/v1/payments/vnpay/return', () => {
    it('verifies signature and parses successful return URL without modifying DB order', async () => {
      const txnRef = `${vnpayOrder.orderNumber}-test1234`;
      await prisma.paymentTransaction.create({
        data: {
          orderId: vnpayOrder.id,
          txnRef,
          amount: 50000000n,
          status: PAYMENT_TRANSACTION_STATUSES.PENDING,
        },
      });

      const rawParams: Record<string, string> = {
        vnp_TmnCode: env.VNPAY_TMN_CODE,
        vnp_Amount: '5000000000',
        vnp_BankCode: 'NCB',
        vnp_BankTranNo: 'VNP14000001',
        vnp_CardType: 'ATM',
        vnp_OrderInfo: 'Thanh toan don hang',
        vnp_PayDate: '20260831103000',
        vnp_ResponseCode: '00',
        vnp_TransactionNo: '14000001',
        vnp_TransactionStatus: '00',
        vnp_TxnRef: txnRef,
      };

      const { signedQuery } = signVnPayParams(rawParams);

      const res = await request(app).get('/api/v1/payments/vnpay/return').query(signedQuery);

      expect(res.status).toBe(200);
      const parsed = vnpayReturnResponseSchema.parse(res.body);
      expect(parsed.data.isSuccess).toBe(true);
      expect(parsed.data.responseCode).toBe('00');
      expect(parsed.data.orderNumber).toBe(vnpayOrder.orderNumber);
      expect(parsed.data.amount).toBe('50000000');

      // Assert that DB order remains PENDING_PAYMENT (Return URL must not update DB!)
      const order = await prisma.order.findUnique({ where: { id: vnpayOrder.id } });
      expect(order?.status).toBe(ORDER_STATUSES.PENDING_PAYMENT);
      expect(order?.paymentStatus).toBe(PAYMENT_STATUSES.PENDING);
    });

    it('identifies tampered checksum on return URL', async () => {
      const rawParams: Record<string, string> = {
        vnp_TmnCode: env.VNPAY_TMN_CODE,
        vnp_Amount: '5000000000',
        vnp_ResponseCode: '00',
        vnp_TxnRef: 'dummy-ref',
        vnp_SecureHash: 'invalid_hash_signature',
      };

      const res = await request(app).get('/api/v1/payments/vnpay/return').query(rawParams);

      expect(res.status).toBe(200);
      const parsed = vnpayReturnResponseSchema.parse(res.body);
      expect(parsed.data.isSuccess).toBe(false);
      expect(parsed.data.message).toBe('Invalid payment signature');
    });

    it('identifies mismatched merchant code on return URL', async () => {
      const rawParams: Record<string, string> = {
        vnp_TmnCode: 'WRONG_TMN',
        vnp_Amount: '5000000000',
        vnp_ResponseCode: '00',
        vnp_TxnRef: 'some-ref',
      };

      const { signedQuery } = signVnPayParams(rawParams);

      const res = await request(app).get('/api/v1/payments/vnpay/return').query(signedQuery);

      expect(res.status).toBe(200);
      const parsed = vnpayReturnResponseSchema.parse(res.body);
      expect(parsed.data.isSuccess).toBe(false);
      expect(parsed.data.message).toBe('Invalid merchant code');
    });
  });

  // ==================== 3. VNPay Server-to-Server IPN ====================

  describe('GET /api/v1/payments/vnpay/ipn', () => {
    it('successfully processes IPN (code 00), confirms order, commits stock, and returns RspCode 00', async () => {
      const txnRef = `${vnpayOrder.orderNumber}-ipn01`;
      await prisma.paymentTransaction.create({
        data: {
          orderId: vnpayOrder.id,
          txnRef,
          amount: 50000000n,
          status: PAYMENT_TRANSACTION_STATUSES.PENDING,
        },
      });

      const rawParams: Record<string, string> = {
        vnp_TmnCode: env.VNPAY_TMN_CODE,
        vnp_Amount: '5000000000',
        vnp_BankCode: 'NCB',
        vnp_BankTranNo: 'VNP14000001',
        vnp_CardType: 'ATM',
        vnp_OrderInfo: 'Thanh toan don hang',
        vnp_PayDate: '20260831103000',
        vnp_ResponseCode: '00',
        vnp_TransactionNo: '14000001',
        vnp_TransactionStatus: '00',
        vnp_TxnRef: txnRef,
      };

      const { signedQuery } = signVnPayParams(rawParams);

      const res = await request(app).get('/api/v1/payments/vnpay/ipn').query(signedQuery);

      expect(res.status).toBe(200);
      const parsed = ipnResponseSchema.parse(res.body);
      expect(parsed.RspCode).toBe('00');
      expect(parsed.Message).toBe('Confirm Success');

      // 1. Verify Order is CONFIRMED and PAID
      const updatedOrder = await prisma.order.findUnique({ where: { id: vnpayOrder.id } });
      expect(updatedOrder?.status).toBe(ORDER_STATUSES.CONFIRMED);
      expect(updatedOrder?.paymentStatus).toBe(PAYMENT_STATUSES.PAID);

      // 2. Verify Stock committed: onHand was 10, 2 reserved -> commitReservation decrements onHand to 8, reserved to 0
      const inv = await prisma.inventory.findUnique({ where: { variantId: testVariant.id } });
      expect(inv?.onHand).toBe(8);
      expect(inv?.reserved).toBe(0);

      // 3. Verify PaymentTransaction is SUCCESS
      const updatedTxn = await prisma.paymentTransaction.findUnique({ where: { txnRef } });
      expect(updatedTxn?.status).toBe(PAYMENT_TRANSACTION_STATUSES.SUCCESS);
      expect(updatedTxn?.bankCode).toBe('NCB');
      expect(updatedTxn?.transactionNo).toBe('14000001');

      // 4. Verify OrderStatusHistory
      const history = await prisma.orderStatusHistory.findFirst({
        where: { orderId: vnpayOrder.id, toStatus: ORDER_STATUSES.CONFIRMED },
      });
      expect(history).not.toBeNull();
      expect(history?.reason).toContain('VNPay payment successful');

      // 5. Verify Audit Log
      const audit = await prisma.auditLog.findFirst({
        where: { action: AUDIT_ACTIONS.PAYMENT_IPN_PROCESSED, targetId: vnpayOrder.id },
      });
      expect(audit).not.toBeNull();
    });

    it('returns RspCode 97 for invalid checksum and does not alter database', async () => {
      const rawParams: Record<string, string> = {
        vnp_TmnCode: env.VNPAY_TMN_CODE,
        vnp_Amount: '5000000000',
        vnp_ResponseCode: '00',
        vnp_TxnRef: 'fake-txn-ref',
        vnp_SecureHash: 'invalid_checksum',
      };

      const res = await request(app).get('/api/v1/payments/vnpay/ipn').query(rawParams);

      expect(res.status).toBe(200);
      const parsed = ipnResponseSchema.parse(res.body);
      expect(parsed.RspCode).toBe('97');
      expect(parsed.Message).toBe('Invalid Checksum');
    });

    it('returns RspCode 01 when transaction reference or order does not exist', async () => {
      const rawParams: Record<string, string> = {
        vnp_TmnCode: env.VNPAY_TMN_CODE,
        vnp_Amount: '5000000000',
        vnp_ResponseCode: '00',
        vnp_TransactionStatus: '00',
        vnp_TxnRef: 'NON_EXISTENT_TXN_REF',
      };

      const { signedQuery } = signVnPayParams(rawParams);

      const res = await request(app).get('/api/v1/payments/vnpay/ipn').query(signedQuery);

      expect(res.status).toBe(200);
      const parsed = ipnResponseSchema.parse(res.body);
      expect(parsed.RspCode).toBe('01');
      expect(parsed.Message).toBe('Order not found');
    });

    it('returns RspCode 04 when payment amount does not match order amount', async () => {
      const txnRef = `${vnpayOrder.orderNumber}-ipn-wrong-amt`;
      await prisma.paymentTransaction.create({
        data: {
          orderId: vnpayOrder.id,
          txnRef,
          amount: 50000000n,
          status: PAYMENT_TRANSACTION_STATUSES.PENDING,
        },
      });

      const rawParams: Record<string, string> = {
        vnp_TmnCode: env.VNPAY_TMN_CODE,
        vnp_Amount: '1000000000', // 10,000,000 VND instead of 50,000,000 VND
        vnp_ResponseCode: '00',
        vnp_TransactionStatus: '00',
        vnp_TxnRef: txnRef,
      };

      const { signedQuery } = signVnPayParams(rawParams);

      const res = await request(app).get('/api/v1/payments/vnpay/ipn').query(signedQuery);

      expect(res.status).toBe(200);
      const parsed = ipnResponseSchema.parse(res.body);
      expect(parsed.RspCode).toBe('04');
      expect(parsed.Message).toBe('Invalid amount');
    });

    it('handles idempotent retries: returns RspCode 02 if order was already confirmed', async () => {
      const txnRef = `${vnpayOrder.orderNumber}-ipn-repeat`;
      await prisma.paymentTransaction.create({
        data: {
          orderId: vnpayOrder.id,
          txnRef,
          amount: 50000000n,
          status: PAYMENT_TRANSACTION_STATUSES.PENDING,
        },
      });

      const rawParams: Record<string, string> = {
        vnp_TmnCode: env.VNPAY_TMN_CODE,
        vnp_Amount: '5000000000',
        vnp_ResponseCode: '00',
        vnp_TransactionStatus: '00',
        vnp_TxnRef: txnRef,
      };

      const { signedQuery } = signVnPayParams(rawParams);

      // Call 1: First success
      const res1 = await request(app).get('/api/v1/payments/vnpay/ipn').query(signedQuery);
      const parsed1 = ipnResponseSchema.parse(res1.body);
      expect(parsed1.RspCode).toBe('00');

      // Call 2: Duplicate IPN retry -> returns 02 without committing stock twice
      const res2 = await request(app).get('/api/v1/payments/vnpay/ipn').query(signedQuery);
      expect(res2.status).toBe(200);
      const parsed2 = ipnResponseSchema.parse(res2.body);
      expect(parsed2.RspCode).toBe('02');
      expect(parsed2.Message).toBe('Order already confirmed');

      // Inventory was committed once only (onHand: 10 - 2 = 8, reserved: 0)
      const inv = await prisma.inventory.findUnique({ where: { variantId: testVariant.id } });
      expect(inv?.onHand).toBe(8);
      expect(inv?.reserved).toBe(0);
    });

    it('handles IPN arrival after order cancellation: logs audit and returns RspCode 02', async () => {
      const txnRef = `${vnpayOrder.orderNumber}-ipn-cancelled`;
      await prisma.paymentTransaction.create({
        data: {
          orderId: vnpayOrder.id,
          txnRef,
          amount: 50000000n,
          status: PAYMENT_TRANSACTION_STATUSES.PENDING,
        },
      });

      // Mark order as CANCELLED before IPN arrives
      await prisma.order.update({
        where: { id: vnpayOrder.id },
        data: { status: ORDER_STATUSES.CANCELLED, cancelReason: 'Customer cancelled' },
      });

      const rawParams: Record<string, string> = {
        vnp_TmnCode: env.VNPAY_TMN_CODE,
        vnp_Amount: '5000000000',
        vnp_ResponseCode: '00',
        vnp_TransactionStatus: '00',
        vnp_TxnRef: txnRef,
      };

      const { signedQuery } = signVnPayParams(rawParams);

      const res = await request(app).get('/api/v1/payments/vnpay/ipn').query(signedQuery);

      expect(res.status).toBe(200);
      const parsed = ipnResponseSchema.parse(res.body);
      expect(parsed.RspCode).toBe('02');
      expect(parsed.Message).toContain('flagged for reconciliation');

      // Assert Order stays CANCELLED
      const order = await prisma.order.findUnique({ where: { id: vnpayOrder.id } });
      expect(order?.status).toBe(ORDER_STATUSES.CANCELLED);

      // Assert Transaction was marked SUCCESS for accounting/reconciliation
      const txn = await prisma.paymentTransaction.findUnique({ where: { txnRef } });
      expect(txn?.status).toBe(PAYMENT_TRANSACTION_STATUSES.SUCCESS);

      // Assert Audit Log was created for reconciliation
      const audit = await prisma.auditLog.findFirst({
        where: {
          action: AUDIT_ACTIONS.PAYMENT_IPN_POST_TERMINATION_RECONCILIATION,
          targetId: vnpayOrder.id,
        },
      });
      expect(audit).not.toBeNull();
    });

    it('handles payment gateway failure (e.g. code 24) and updates transaction to FAILED', async () => {
      const txnRef = `${vnpayOrder.orderNumber}-ipn-fail`;
      await prisma.paymentTransaction.create({
        data: {
          orderId: vnpayOrder.id,
          txnRef,
          amount: 50000000n,
          status: PAYMENT_TRANSACTION_STATUSES.PENDING,
        },
      });

      const rawParams: Record<string, string> = {
        vnp_TmnCode: env.VNPAY_TMN_CODE,
        vnp_Amount: '5000000000',
        vnp_ResponseCode: '24', // Customer cancelled payment on VNPay gateway
        vnp_TransactionStatus: '02',
        vnp_TxnRef: txnRef,
      };

      const { signedQuery } = signVnPayParams(rawParams);

      const res = await request(app).get('/api/v1/payments/vnpay/ipn').query(signedQuery);

      expect(res.status).toBe(200);
      const parsed = ipnResponseSchema.parse(res.body);
      expect(parsed.RspCode).toBe('00');
      expect(parsed.Message).toBe('Confirm Success');

      // Transaction marked as FAILED in DB
      const txn = await prisma.paymentTransaction.findUnique({ where: { txnRef } });
      expect(txn?.status).toBe(PAYMENT_TRANSACTION_STATUSES.FAILED);
      expect(txn?.responseCode).toBe('24');
    });
  });
});
