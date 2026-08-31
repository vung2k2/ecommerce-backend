import bcrypt from 'bcrypt';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import {
  AUDIT_ACTIONS,
  ERROR_CODES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PERMISSIONS,
  ROLES,
} from '../src/constants/index.js';
import { prisma } from '../src/database/prisma.js';
import { jwtService } from '../src/utils/jwt.js';

// ==================== Response Schemas for Testing ====================

const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

const orderItemSchema = z.object({
  id: z.string().uuid(),
  variantId: z.string().uuid().nullable(),
  productName: z.string(),
  sku: z.string(),
  options: z.record(z.string(), z.unknown()).nullable(),
  unitPrice: z.string(),
  quantity: z.number().int(),
  totalPrice: z.string(),
  createdAt: z.string(),
});

const orderStatusHistorySchema = z.object({
  id: z.string().uuid(),
  fromStatus: z.string().nullable(),
  toStatus: z.string(),
  reason: z.string().nullable(),
  changedById: z.string().uuid().nullable(),
  createdAt: z.string(),
});

const orderDetailSchema = z.object({
  id: z.string().uuid(),
  orderNumber: z.string(),
  userId: z.string().uuid(),
  status: z.string(),
  paymentMethod: z.string(),
  paymentStatus: z.string(),
  subtotalAmount: z.string(),
  discountAmount: z.string(),
  shippingFee: z.string(),
  totalAmount: z.string(),
  couponCode: z.string().nullable(),
  notes: z.string().nullable(),
  cancelReason: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  shippingAddress: z.object({
    recipientName: z.string(),
    phone: z.string(),
    province: z.string(),
    district: z.string(),
    ward: z.string(),
    streetAddress: z.string(),
  }),
  totalItems: z.number().int(),
  items: z.array(orderItemSchema),
  statusHistory: z.array(orderStatusHistorySchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const checkoutResponseSchema = z.object({
  data: z.object({
    order: orderDetailSchema,
  }),
});

const orderMutationResponseSchema = z.object({
  data: z.object({
    order: orderDetailSchema,
    message: z.string().optional(),
  }),
});

const listOrdersResponseSchema = z.object({
  data: z.array(orderDetailSchema),
  meta: z.object({
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

const cartResponseSchema = z.object({
  data: z.object({
    items: z.array(z.unknown()),
  }),
});

describe('Order & Checkout Module Integration Tests', () => {
  const app = createApp();

  let adminToken: string;
  let staffTokenWithOrders: string;
  let staffTokenWithoutOrders: string;
  let customer1Token: string;
  let customer1Id: string;
  let customer1AddressId: string;
  let customer2Token: string;
  let customer2AddressId: string;

  let testCategory: { id: string };
  let testProduct: { id: string; name: string };
  let testVariant1: { id: string; sku: string; price: bigint };
  let testVariant2: { id: string; sku: string; price: bigint };

  beforeEach(async () => {
    // Clear test tables in order of foreign key dependencies
    await prisma.auditLog.deleteMany();
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

    // Create Admin
    const admin = await prisma.user.create({
      data: {
        email: 'admin@order-test.com',
        passwordHash,
        fullName: 'Admin User',
        role: ROLES.ADMIN,
      },
    });
    adminToken = jwtService.signAccessToken({
      userId: admin.id,
      role: admin.role,
    });

    // Create Staff with order permissions
    const staffWithOrders = await prisma.user.create({
      data: {
        email: 'staff-orders@order-test.com',
        passwordHash,
        fullName: 'Order Staff',
        role: ROLES.STAFF,
        permissions: {
          createMany: {
            data: [
              { permission: PERMISSIONS.ORDER_READ },
              { permission: PERMISSIONS.ORDER_UPDATE },
            ],
          },
        },
      },
    });
    staffTokenWithOrders = jwtService.signAccessToken({
      userId: staffWithOrders.id,
      role: staffWithOrders.role,
    });

    // Create Staff without order permissions
    const staffWithoutOrders = await prisma.user.create({
      data: {
        email: 'staff-catalog@order-test.com',
        passwordHash,
        fullName: 'Catalog Staff',
        role: ROLES.STAFF,
        permissions: {
          create: { permission: PERMISSIONS.CATALOG_READ },
        },
      },
    });
    staffTokenWithoutOrders = jwtService.signAccessToken({
      userId: staffWithoutOrders.id,
      role: staffWithoutOrders.role,
    });

    // Create Customer 1 with Address
    const customer1 = await prisma.user.create({
      data: {
        email: 'customer1@order-test.com',
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

    const address1 = await prisma.address.create({
      data: {
        userId: customer1.id,
        recipientName: 'Customer One',
        phone: '0987654321',
        province: 'TP. Ho Chi Minh',
        district: 'Quan 1',
        ward: 'Phuong Ben Nghe',
        streetAddress: '123 Le Loi',
        isDefault: true,
      },
    });
    customer1AddressId = address1.id;

    // Create Customer 2 with Address
    const customer2 = await prisma.user.create({
      data: {
        email: 'customer2@order-test.com',
        passwordHash,
        fullName: 'Customer Two',
        role: ROLES.CUSTOMER,
      },
    });
    customer2Token = jwtService.signAccessToken({
      userId: customer2.id,
      role: customer2.role,
    });

    const address2 = await prisma.address.create({
      data: {
        userId: customer2.id,
        recipientName: 'Customer Two',
        phone: '0912345678',
        province: 'Ha Noi',
        district: 'Ba Dinh',
        ward: 'Phuong Dien Bien',
        streetAddress: '456 Hung Vuong',
        isDefault: true,
      },
    });
    customer2AddressId = address2.id;

    // Create Category & Product with 2 Variants
    testCategory = await prisma.category.create({
      data: {
        name: 'Laptops',
        slug: 'laptops',
      },
    });

    testProduct = await prisma.product.create({
      data: {
        name: 'ThinkPad X1 Carbon',
        slug: 'thinkpad-x1-carbon',
        status: 'ACTIVE',
        categoryId: testCategory.id,
      },
    });

    testVariant1 = await prisma.productVariant.create({
      data: {
        productId: testProduct.id,
        sku: 'TP-X1-16GB',
        name: 'ThinkPad X1 16GB RAM',
        price: 30000000n,
        options: { RAM: '16GB' },
        isActive: true,
      },
    });

    testVariant2 = await prisma.productVariant.create({
      data: {
        productId: testProduct.id,
        sku: 'TP-X1-32GB',
        name: 'ThinkPad X1 32GB RAM',
        price: 40000000n,
        options: { RAM: '32GB' },
        isActive: true,
      },
    });

    // Stock for variants: Variant 1 has 10 on-hand, Variant 2 has 5 on-hand
    await prisma.inventory.create({
      data: {
        variantId: testVariant1.id,
        onHand: 10,
        reserved: 0,
      },
    });

    await prisma.inventory.create({
      data: {
        variantId: testVariant2.id,
        onHand: 5,
        reserved: 0,
      },
    });
  });

  // ==================== 1. Checkout with COD ====================

  describe('POST /api/v1/checkout - COD Flow', () => {
    it('successfully checks out with COD, creates CONFIRMED order, commits stock, and clears cart', async () => {
      // Step 1: Add items to customer 1 cart
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ variantId: testVariant1.id, quantity: 2 });

      // Step 2: Checkout via COD
      const res = await request(app)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          addressId: customer1AddressId,
          paymentMethod: PAYMENT_METHODS.COD,
          notes: 'Giao trong gio hanh chinh',
        });

      expect(res.status).toBe(201);
      const parsed = checkoutResponseSchema.parse(res.body);
      const order = parsed.data.order;

      expect(order.status).toBe(ORDER_STATUSES.CONFIRMED);
      expect(order.paymentMethod).toBe(PAYMENT_METHODS.COD);
      expect(order.paymentStatus).toBe(PAYMENT_STATUSES.PENDING);
      expect(order.subtotalAmount).toBe('60000000');
      expect(order.discountAmount).toBe('0');
      expect(order.totalAmount).toBe('60000000');
      expect(order.items).toHaveLength(1);
      expect(order.items[0]?.sku).toBe(testVariant1.sku);
      expect(order.items[0]?.quantity).toBe(2);
      expect(order.items[0]?.unitPrice).toBe('30000000');
      expect(order.items[0]?.totalPrice).toBe('60000000');
      expect(order.shippingAddress.recipientName).toBe('Customer One');

      // Check status history
      expect(order.statusHistory.length).toBeGreaterThanOrEqual(1);

      // Verify cart is cleared
      const cartRes = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${customer1Token}`);
      const parsedCart = cartResponseSchema.parse(cartRes.body);
      expect(parsedCart.data.items).toHaveLength(0);

      // Verify inventory: onHand decremented from 10 to 8, reserved is 0
      const inv = await prisma.inventory.findUnique({
        where: { variantId: testVariant1.id },
      });
      expect(inv?.onHand).toBe(8);
      expect(inv?.reserved).toBe(0);

      // Verify audit log
      const audit = await prisma.auditLog.findFirst({
        where: { action: AUDIT_ACTIONS.ORDER_CREATED, targetId: order.id },
      });
      expect(audit).toBeDefined();
    });
  });

  // ==================== 2. Checkout with VNPay ====================

  describe('POST /api/v1/checkout - VNPay Flow', () => {
    it('successfully checks out with VNPay, creates PENDING_PAYMENT order, and reserves stock', async () => {
      // Add items to cart
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ variantId: testVariant2.id, quantity: 3 });

      // Checkout via VNPay
      const res = await request(app)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          addressId: customer1AddressId,
          paymentMethod: PAYMENT_METHODS.VNPAY,
        });

      expect(res.status).toBe(201);
      const parsed = checkoutResponseSchema.parse(res.body);
      const order = parsed.data.order;

      expect(order.status).toBe(ORDER_STATUSES.PENDING_PAYMENT);
      expect(order.paymentMethod).toBe(PAYMENT_METHODS.VNPAY);
      expect(order.paymentStatus).toBe(PAYMENT_STATUSES.PENDING);
      expect(order.totalAmount).toBe('120000000');

      // Verify inventory: onHand remains 5, reserved increased from 0 to 3
      const inv = await prisma.inventory.findUnique({
        where: { variantId: testVariant2.id },
      });
      expect(inv?.onHand).toBe(5);
      expect(inv?.reserved).toBe(3);
    });
  });

  // ==================== 3. Checkout with Coupon ====================

  describe('POST /api/v1/checkout - Coupon Validation & Usage', () => {
    it('applies percentage coupon with max discount cap and records coupon usage atomically', async () => {
      // Create coupon: 20% off, max 5,000,000 VND
      await prisma.coupon.create({
        data: {
          code: 'LAPTOP20',
          discountType: 'PERCENTAGE',
          discountValue: 20n,
          maxDiscountAmount: 5000000n,
          minOrderAmount: 20000000n,
          usageLimit: 10,
          usedCount: 0,
          usageLimitPerUser: 1,
          startDate: new Date(Date.now() - 10000),
          endDate: new Date(Date.now() + 10000000),
          isActive: true,
        },
      });

      // Add item (30,000,000 VND)
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ variantId: testVariant1.id, quantity: 1 });

      const res = await request(app)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          addressId: customer1AddressId,
          paymentMethod: PAYMENT_METHODS.COD,
          couponCode: 'LAPTOP20',
        });

      expect(res.status).toBe(201);
      const parsed = checkoutResponseSchema.parse(res.body);
      const order = parsed.data.order;
      expect(order.subtotalAmount).toBe('30000000');
      expect(order.discountAmount).toBe('5000000'); // Capped at maxDiscountAmount
      expect(order.totalAmount).toBe('25000000');
      expect(order.couponCode).toBe('LAPTOP20');

      // Verify coupon usage in DB
      const coupon = await prisma.coupon.findUnique({ where: { code: 'LAPTOP20' } });
      expect(coupon?.usedCount).toBe(1);

      const usage = await prisma.couponUsage.findFirst({
        where: { couponId: coupon!.id, userId: customer1Id },
      });
      expect(usage?.discountAmount).toBe(5000000n);
      expect(usage?.orderId).toBe(order.id);
    });

    it('rejects checkout when coupon exceeds per-user usage limit', async () => {
      const coupon = await prisma.coupon.create({
        data: {
          code: 'ONETIMEONLY',
          discountType: 'FIXED_AMOUNT',
          discountValue: 1000000n,
          usageLimitPerUser: 1,
          startDate: new Date(Date.now() - 10000),
          endDate: new Date(Date.now() + 10000000),
          isActive: true,
        },
      });

      // Manually add existing usage for customer 1
      await prisma.couponUsage.create({
        data: {
          couponId: coupon.id,
          userId: customer1Id,
          discountAmount: 1000000n,
        },
      });

      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ variantId: testVariant1.id, quantity: 1 });

      const res = await request(app)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          addressId: customer1AddressId,
          paymentMethod: PAYMENT_METHODS.COD,
          couponCode: 'ONETIMEONLY',
        });

      expect(res.status).toBe(422);
      const parsed = errorResponseSchema.parse(res.body);
      expect(parsed.error.code).toBe(ERROR_CODES.COUPON_USER_LIMIT_EXCEEDED);
    });
  });

  // ==================== 4. Checkout Validation Failures ====================

  describe('POST /api/v1/checkout - Failure cases', () => {
    it('rejects checkout when shopping cart is empty', async () => {
      const res = await request(app)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          addressId: customer1AddressId,
          paymentMethod: PAYMENT_METHODS.COD,
        });

      expect(res.status).toBe(400);
      const parsed = errorResponseSchema.parse(res.body);
      expect(parsed.error.code).toBe(ERROR_CODES.ORDER_CART_EMPTY);
    });

    it('rejects checkout when requested quantity exceeds available stock', async () => {
      // Set variant stock available to 1
      await prisma.inventory.update({
        where: { variantId: testVariant1.id },
        data: { onHand: 1, reserved: 0 },
      });

      // Put 2 items in cart
      const cart = await prisma.cart.create({ data: { userId: customer1Id } });
      await prisma.cartItem.create({
        data: { cartId: cart.id, variantId: testVariant1.id, quantity: 2 },
      });

      const res = await request(app)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          addressId: customer1AddressId,
          paymentMethod: PAYMENT_METHODS.COD,
        });

      expect(res.status).toBe(422);
      const parsed = errorResponseSchema.parse(res.body);
      expect(parsed.error.code).toBe(ERROR_CODES.ORDER_CART_ITEMS_UNAVAILABLE);
    });

    it('rejects checkout with address belonging to another user', async () => {
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ variantId: testVariant1.id, quantity: 1 });

      const res = await request(app)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          addressId: customer2AddressId, // Belongs to customer 2
          paymentMethod: PAYMENT_METHODS.COD,
        });

      expect(res.status).toBe(404);
      const parsed = errorResponseSchema.parse(res.body);
      expect(parsed.error.code).toBe(ERROR_CODES.ADDRESS_NOT_FOUND);
    });
  });

  // ==================== 5. Customer Orders List & Detail & Isolation ====================

  describe('GET /api/v1/orders & GET /api/v1/orders/:id', () => {
    it('allows customer to view their orders and prevents accessing another customer order', async () => {
      // Customer 1 places order
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ variantId: testVariant1.id, quantity: 1 });

      const checkoutRes = await request(app)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          addressId: customer1AddressId,
          paymentMethod: PAYMENT_METHODS.COD,
        });

      const parsedCheckout = checkoutResponseSchema.parse(checkoutRes.body);
      const orderId = parsedCheckout.data.order.id;

      // Customer 1 views their order list
      const listRes = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${customer1Token}`);

      expect(listRes.status).toBe(200);
      const parsedList = listOrdersResponseSchema.parse(listRes.body);
      expect(parsedList.data.length).toBe(1);
      expect(parsedList.data[0]?.id).toBe(orderId);

      // Customer 1 views order detail
      const detailRes = await request(app)
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${customer1Token}`);

      expect(detailRes.status).toBe(200);
      const parsedDetail = checkoutResponseSchema.parse(detailRes.body);
      expect(parsedDetail.data.order.id).toBe(orderId);

      // Customer 2 tries to view Customer 1's order -> 404
      const forbiddenRes = await request(app)
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${customer2Token}`);

      expect(forbiddenRes.status).toBe(404);
      const parsedError = errorResponseSchema.parse(forbiddenRes.body);
      expect(parsedError.error.code).toBe(ERROR_CODES.ORDER_NOT_FOUND);
    });
  });

  // ==================== 6. Customer Order Cancellation ====================

  describe('POST /api/v1/orders/:id/cancel', () => {
    it('allows customer to cancel PENDING_PAYMENT order and releases reserved stock', async () => {
      // VNPay checkout (reserves 2 units)
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ variantId: testVariant1.id, quantity: 2 });

      const checkoutRes = await request(app)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          addressId: customer1AddressId,
          paymentMethod: PAYMENT_METHODS.VNPAY,
        });

      const parsedCheckout = checkoutResponseSchema.parse(checkoutRes.body);
      const orderId = parsedCheckout.data.order.id;

      // Verify reserved stock before cancellation
      let inv = await prisma.inventory.findUnique({ where: { variantId: testVariant1.id } });
      expect(inv?.reserved).toBe(2);

      // Customer cancels order
      const cancelRes = await request(app)
        .post(`/api/v1/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ reason: 'Không muốn thanh toán nữa' });

      expect(cancelRes.status).toBe(200);
      const parsedCancel = orderMutationResponseSchema.parse(cancelRes.body);
      expect(parsedCancel.data.order.status).toBe(ORDER_STATUSES.CANCELLED);
      expect(parsedCancel.data.order.cancelReason).toBe('Không muốn thanh toán nữa');

      // Verify reserved stock released back to 0
      inv = await prisma.inventory.findUnique({ where: { variantId: testVariant1.id } });
      expect(inv?.reserved).toBe(0);
      expect(inv?.onHand).toBe(10);
    });

    it('allows customer to cancel CONFIRMED order and refunds on-hand stock', async () => {
      // COD checkout (deducts 2 units from onHand: 10 -> 8)
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ variantId: testVariant1.id, quantity: 2 });

      const checkoutRes = await request(app)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          addressId: customer1AddressId,
          paymentMethod: PAYMENT_METHODS.COD,
        });

      const parsedCheckout = checkoutResponseSchema.parse(checkoutRes.body);
      const orderId = parsedCheckout.data.order.id;

      // Customer cancels CONFIRMED order
      const cancelRes = await request(app)
        .post(`/api/v1/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ reason: 'Đổi ý không mua nữa' });

      expect(cancelRes.status).toBe(200);
      const parsedCancel = orderMutationResponseSchema.parse(cancelRes.body);
      expect(parsedCancel.data.order.status).toBe(ORDER_STATUSES.CANCELLED);

      // Verify onHand stock refunded back to 10
      const inv = await prisma.inventory.findUnique({ where: { variantId: testVariant1.id } });
      expect(inv?.onHand).toBe(10);
      expect(inv?.reserved).toBe(0);
    });

    it('blocks customer from cancelling order once it enters PROCESSING status', async () => {
      // Create and set order to PROCESSING
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ variantId: testVariant1.id, quantity: 1 });

      const checkoutRes = await request(app)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          addressId: customer1AddressId,
          paymentMethod: PAYMENT_METHODS.COD,
        });

      const parsedCheckout = checkoutResponseSchema.parse(checkoutRes.body);
      const orderId = parsedCheckout.data.order.id;

      // Admin transitions order to PROCESSING
      await request(app)
        .patch(`/api/v1/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: ORDER_STATUSES.PROCESSING });

      // Customer tries to cancel
      const cancelRes = await request(app)
        .post(`/api/v1/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ reason: 'Muốn hủy khi đang đóng gói' });

      expect(cancelRes.status).toBe(422);
      const parsedError = errorResponseSchema.parse(cancelRes.body);
      expect(parsedError.error.code).toBe(ERROR_CODES.ORDER_CANNOT_CANCEL);
    });
  });

  // ==================== 7. Admin Order Management & State Transitions ====================

  describe('Admin Order Operations (/api/v1/admin/orders)', () => {
    it('requires order:read and order:update permissions for staff', async () => {
      // Staff without permission
      const getRes = await request(app)
        .get('/api/v1/admin/orders')
        .set('Authorization', `Bearer ${staffTokenWithoutOrders}`);
      expect(getRes.status).toBe(403);

      // Staff with permission
      const allowedRes = await request(app)
        .get('/api/v1/admin/orders')
        .set('Authorization', `Bearer ${staffTokenWithOrders}`);
      expect(allowedRes.status).toBe(200);
    });

    it('validates state transitions: CONFIRMED -> PROCESSING -> SHIPPING -> DELIVERED (marks COD as PAID)', async () => {
      // Place COD order
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ variantId: testVariant1.id, quantity: 1 });

      const checkoutRes = await request(app)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          addressId: customer1AddressId,
          paymentMethod: PAYMENT_METHODS.COD,
        });

      const parsedCheckout = checkoutResponseSchema.parse(checkoutRes.body);
      const orderId = parsedCheckout.data.order.id;

      // 1. Transition to PROCESSING
      const procRes = await request(app)
        .patch(`/api/v1/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${staffTokenWithOrders}`)
        .send({ status: ORDER_STATUSES.PROCESSING, reason: 'Kho đang đóng gói' });
      expect(procRes.status).toBe(200);
      const parsedProc = orderMutationResponseSchema.parse(procRes.body);
      expect(parsedProc.data.order.status).toBe(ORDER_STATUSES.PROCESSING);

      // 2. Transition to SHIPPING
      const shipRes = await request(app)
        .patch(`/api/v1/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${staffTokenWithOrders}`)
        .send({ status: ORDER_STATUSES.SHIPPING, reason: 'Giao cho bưu tá' });
      expect(shipRes.status).toBe(200);
      const parsedShip = orderMutationResponseSchema.parse(shipRes.body);
      expect(parsedShip.data.order.status).toBe(ORDER_STATUSES.SHIPPING);

      // 3. Transition to DELIVERED -> paymentStatus becomes PAID for COD
      const delivRes = await request(app)
        .patch(`/api/v1/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${staffTokenWithOrders}`)
        .send({ status: ORDER_STATUSES.DELIVERED, reason: 'Khách đã nhận hàng' });
      expect(delivRes.status).toBe(200);
      const parsedDeliv = orderMutationResponseSchema.parse(delivRes.body);
      expect(parsedDeliv.data.order.status).toBe(ORDER_STATUSES.DELIVERED);
      expect(parsedDeliv.data.order.paymentStatus).toBe(PAYMENT_STATUSES.PAID);
    });

    it('rejects invalid state transition (jumping or backwards)', async () => {
      // Place COD order (starts at CONFIRMED)
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ variantId: testVariant1.id, quantity: 1 });

      const checkoutRes = await request(app)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          addressId: customer1AddressId,
          paymentMethod: PAYMENT_METHODS.COD,
        });

      const parsedCheckout = checkoutResponseSchema.parse(checkoutRes.body);
      const orderId = parsedCheckout.data.order.id;

      // Try illegal transition: CONFIRMED -> DELIVERED (skipping PROCESSING and SHIPPING)
      const invalidRes = await request(app)
        .patch(`/api/v1/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${staffTokenWithOrders}`)
        .send({ status: ORDER_STATUSES.DELIVERED });

      expect(invalidRes.status).toBe(422);
      const parsedError = errorResponseSchema.parse(invalidRes.body);
      expect(parsedError.error.code).toBe(ERROR_CODES.ORDER_INVALID_STATE_TRANSITION);
    });

    it('rejects admin manually confirming VNPay order from PENDING_PAYMENT to CONFIRMED', async () => {
      // Place VNPay order
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ variantId: testVariant1.id, quantity: 1 });

      const checkoutRes = await request(app)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          addressId: customer1AddressId,
          paymentMethod: PAYMENT_METHODS.VNPAY,
        });

      const parsedCheckout = checkoutResponseSchema.parse(checkoutRes.body);
      const orderId = parsedCheckout.data.order.id;

      // Admin tries to manually confirm VNPay order
      const confirmRes = await request(app)
        .patch(`/api/v1/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${staffTokenWithOrders}`)
        .send({ status: ORDER_STATUSES.CONFIRMED });

      expect(confirmRes.status).toBe(422);
      const parsedError = errorResponseSchema.parse(confirmRes.body);
      expect(parsedError.error.code).toBe(
        ERROR_CODES.ORDER_VNPAY_ADMIN_CONFIRM_NOT_ALLOWED,
      );
    });

    it('transitions order to PAYMENT_EXPIRED, releases stock, coupon, and expires payment transactions', async () => {
      // Place VNPay order with coupon
      const coupon = await prisma.coupon.create({
        data: {
          code: 'EXPIRINGCOUPON',
          discountType: 'FIXED_AMOUNT',
          discountValue: 1000000n,
          usageLimit: 10,
          usedCount: 0,
          usageLimitPerUser: 1,
          startDate: new Date(Date.now() - 10000),
          endDate: new Date(Date.now() + 10000000),
          isActive: true,
        },
      });

      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ variantId: testVariant1.id, quantity: 1 });

      const checkoutRes = await request(app)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          addressId: customer1AddressId,
          paymentMethod: PAYMENT_METHODS.VNPAY,
          couponCode: 'EXPIRINGCOUPON',
        });

      const parsedCheckout = checkoutResponseSchema.parse(checkoutRes.body);
      const orderId = parsedCheckout.data.order.id;

      // Create a pending payment transaction
      await prisma.paymentTransaction.create({
        data: {
          orderId,
          txnRef: `ORD-EXPIRE-TEST-${Date.now()}`,
          amount: 29000000n,
          status: 'PENDING',
        },
      });

      // Admin expires order
      const expireRes = await request(app)
        .patch(`/api/v1/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${staffTokenWithOrders}`)
        .send({ status: ORDER_STATUSES.PAYMENT_EXPIRED, reason: 'Payment window expired' });

      expect(expireRes.status).toBe(200);
      const parsedExpire = orderMutationResponseSchema.parse(expireRes.body);
      expect(parsedExpire.data.order.status).toBe(ORDER_STATUSES.PAYMENT_EXPIRED);
      expect(parsedExpire.data.order.paymentStatus).toBe(PAYMENT_STATUSES.EXPIRED);

      // Verify inventory released: reserved was 1 -> becomes 0
      const inv = await prisma.inventory.findUnique({ where: { variantId: testVariant1.id } });
      expect(inv?.reserved).toBe(0);

      // Verify coupon returned
      const updatedCoupon = await prisma.coupon.findUnique({ where: { id: coupon.id } });
      expect(updatedCoupon?.usedCount).toBe(0);

      // Verify pending transactions marked EXPIRED
      const transactions = await prisma.paymentTransaction.findMany({ where: { orderId } });
      expect(transactions[0]?.status).toBe('EXPIRED');
    });
  });

  // ==================== 8. Catalog Soft-delete Protection ====================

  describe('Catalog Soft-Delete Protection for Ordered Products & Variants', () => {
    it('prevents hard-deleting a product or variant that has been ordered', async () => {
      // Customer orders testVariant1
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ variantId: testVariant1.id, quantity: 1 });

      await request(app)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          addressId: customer1AddressId,
          paymentMethod: PAYMENT_METHODS.COD,
        });

      // Admin tries to delete the variant
      const deleteVariantRes = await request(app)
        .delete(`/api/v1/admin/variants/${testVariant1.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(deleteVariantRes.status).toBe(409);
      const parsedVariantErr = errorResponseSchema.parse(deleteVariantRes.body);
      expect(parsedVariantErr.error.code).toBe(
        ERROR_CODES.ORDER_VARIANT_ORDERED_CANNOT_DELETE,
      );

      // Admin tries to delete the product
      const deleteProductRes = await request(app)
        .delete(`/api/v1/admin/products/${testProduct.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(deleteProductRes.status).toBe(409);
      const parsedProductErr = errorResponseSchema.parse(deleteProductRes.body);
      expect(parsedProductErr.error.code).toBe(
        ERROR_CODES.ORDER_VARIANT_ORDERED_CANNOT_DELETE,
      );
    });
  });
});
