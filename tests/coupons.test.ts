import bcrypt from 'bcrypt';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import { AUDIT_ACTIONS, ERROR_CODES, PERMISSIONS, ROLES } from '../src/constants/index.js';
import { prisma } from '../src/database/prisma.js';
import { jwtService } from '../src/utils/jwt.js';

// ==================== Response Schemas for Testing ====================

const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

const couponItemSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  description: z.string().nullable(),
  discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']),
  discountValue: z.string(),
  maxDiscountAmount: z.string().nullable(),
  minOrderAmount: z.string(),
  usageLimit: z.number().int().nullable(),
  usedCount: z.number().int(),
  usageLimitPerUser: z.number().int().nullable(),
  startDate: z.string(),
  endDate: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const couponDetailResponseSchema = z.object({
  data: z.object({
    coupon: couponItemSchema,
  }),
});

const listCouponsResponseSchema = z.object({
  data: z.array(couponItemSchema),
  meta: z.object({
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

const validateCouponResponseSchema = z.object({
  data: z.object({
    coupon: couponItemSchema,
    subtotal: z.string(),
    discountAmount: z.string(),
    finalTotal: z.string(),
  }),
});

const deleteCouponResponseSchema = z.object({
  data: z.object({
    message: z.string(),
  }),
});

describe('Coupon Module Integration Tests', () => {
  const app = createApp();

  let adminToken: string;
  let staffTokenWithManage: string;
  let staffTokenWithoutManage: string;
  let customerToken: string;
  let customerId: string;

  let testProduct: { id: string };
  let testVariant: { id: string; price: bigint };

  const oneDayMs = 24 * 60 * 60 * 1000;
  const pastDate = new Date(Date.now() - 30 * oneDayMs);
  const farPastDate = new Date(Date.now() - 60 * oneDayMs);
  const futureDate = new Date(Date.now() + 30 * oneDayMs);
  const farFutureDate = new Date(Date.now() + 60 * oneDayMs);

  beforeEach(async () => {
    // Clear test tables
    await prisma.paymentTransaction.deleteMany();
    await prisma.orderStatusHistory.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.couponUsage.deleteMany();
    await prisma.coupon.deleteMany();
    await prisma.cartItem.deleteMany();
    await prisma.cart.deleteMany();
    await prisma.stockMovement.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.userPermission.deleteMany();
    await prisma.user.deleteMany();

    const passwordHash = await bcrypt.hash('Password123!', 10);

    // 1. Admin
    const admin = await prisma.user.create({
      data: {
        email: 'admin@coupon-test.com',
        passwordHash,
        fullName: 'Admin User',
        role: ROLES.ADMIN,
      },
    });
    adminToken = jwtService.signAccessToken({ userId: admin.id, role: admin.role });

    // 2. Staff with coupon:manage
    const staffManage = await prisma.user.create({
      data: {
        email: 'staff-coupon@coupon-test.com',
        passwordHash,
        fullName: 'Staff Coupon Manager',
        role: ROLES.STAFF,
      },
    });
    await prisma.userPermission.create({
      data: {
        userId: staffManage.id,
        permission: PERMISSIONS.COUPON_MANAGE,
      },
    });
    staffTokenWithManage = jwtService.signAccessToken({
      userId: staffManage.id,
      role: staffManage.role,
    });

    // 3. Staff without coupon:manage
    const staffNoManage = await prisma.user.create({
      data: {
        email: 'staff-other@coupon-test.com',
        passwordHash,
        fullName: 'Staff Regular',
        role: ROLES.STAFF,
      },
    });
    staffTokenWithoutManage = jwtService.signAccessToken({
      userId: staffNoManage.id,
      role: staffNoManage.role,
    });

    // 4. Customer
    const customer = await prisma.user.create({
      data: {
        email: 'customer@coupon-test.com',
        passwordHash,
        fullName: 'Regular Customer',
        role: ROLES.CUSTOMER,
      },
    });
    customerId = customer.id;
    customerToken = jwtService.signAccessToken({
      userId: customer.id,
      role: customer.role,
    });

    // Setup Category & Product & Variant for cart
    const category = await prisma.category.create({
      data: { name: 'Audio', slug: 'audio' },
    });
    testProduct = await prisma.product.create({
      data: {
        name: 'Sony WH-1000XM5',
        slug: 'sony-wh-1000xm5',
        status: 'ACTIVE',
        categoryId: category.id,
      },
    });
    testVariant = await prisma.productVariant.create({
      data: {
        productId: testProduct.id,
        sku: 'SONY-XM5-BLK',
        name: 'Black',
        price: 8000000n, // 8,000,000 VND
        isActive: true,
      },
    });
    await prisma.inventory.create({
      data: {
        variantId: testVariant.id,
        onHand: 10,
        reserved: 0,
      },
    });
  });

  describe('Admin Coupon CRUD & Permissions', () => {
    it('creates a PERCENTAGE coupon successfully and records audit log', async () => {
      const payload = {
        code: 'summer_sale',
        description: 'Summer Sale 20%',
        discountType: 'PERCENTAGE',
        discountValue: 20,
        maxDiscountAmount: 500000,
        minOrderAmount: 2000000,
        usageLimit: 100,
        usageLimitPerUser: 1,
        startDate: pastDate.toISOString(),
        endDate: futureDate.toISOString(),
        isActive: true,
      };

      const response = await request(app)
        .post('/api/v1/admin/coupons')
        .set('Authorization', `Bearer ${staffTokenWithManage}`)
        .send(payload);

      expect(response.status).toBe(201);
      const parsed = couponDetailResponseSchema.parse(response.body);
      expect(parsed.data.coupon.code).toBe('SUMMER_SALE'); // Uppercase
      expect(parsed.data.coupon.discountType).toBe('PERCENTAGE');
      expect(parsed.data.coupon.discountValue).toBe('20');
      expect(parsed.data.coupon.maxDiscountAmount).toBe('500000');
      expect(parsed.data.coupon.minOrderAmount).toBe('2000000');
      expect(parsed.data.coupon.usageLimit).toBe(100);

      // Verify audit log
      const auditLog = await prisma.auditLog.findFirst({
        where: { action: AUDIT_ACTIONS.COUPON_CREATED, targetId: parsed.data.coupon.id },
      });
      expect(auditLog).toBeDefined();
    });

    it('creates a FIXED_AMOUNT coupon successfully', async () => {
      const payload = {
        code: 'WELCOME50K',
        description: 'Giảm 50k cho khách mới',
        discountType: 'FIXED_AMOUNT',
        discountValue: 50000,
        minOrderAmount: 300000,
        startDate: pastDate.toISOString(),
        endDate: futureDate.toISOString(),
      };

      const response = await request(app)
        .post('/api/v1/admin/coupons')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

      expect(response.status).toBe(201);
      const parsed = couponDetailResponseSchema.parse(response.body);
      expect(parsed.data.coupon.code).toBe('WELCOME50K');
      expect(parsed.data.coupon.discountType).toBe('FIXED_AMOUNT');
      expect(parsed.data.coupon.discountValue).toBe('50000');
      expect(parsed.data.coupon.maxDiscountAmount).toBeNull();
    });

    it('rejects coupon creation without coupon:manage permission', async () => {
      const response = await request(app)
        .post('/api/v1/admin/coupons')
        .set('Authorization', `Bearer ${staffTokenWithoutManage}`)
        .send({
          code: 'FAILCODE',
          discountType: 'FIXED_AMOUNT',
          discountValue: 50000,
          startDate: pastDate.toISOString(),
          endDate: futureDate.toISOString(),
        });

      expect(response.status).toBe(403);
    });

    it('rejects duplicate coupon code with 409', async () => {
      const payload = {
        code: 'DUPLICATE',
        discountType: 'FIXED_AMOUNT',
        discountValue: 50000,
        startDate: pastDate.toISOString(),
        endDate: futureDate.toISOString(),
      };

      await request(app)
        .post('/api/v1/admin/coupons')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

      const response = await request(app)
        .post('/api/v1/admin/coupons')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

      expect(response.status).toBe(409);
      const error = errorResponseSchema.parse(response.body);
      expect(error.error.code).toBe(ERROR_CODES.COUPON_CODE_EXISTS);
    });

    it('handles concurrent coupon creation with duplicate code gracefully', async () => {
      const payload = {
        code: 'RACE_COUPON',
        discountType: 'FIXED_AMOUNT',
        discountValue: 50000,
        startDate: pastDate.toISOString(),
        endDate: futureDate.toISOString(),
      };

      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/v1/admin/coupons')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(payload),
        request(app)
          .post('/api/v1/admin/coupons')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(payload),
      ]);

      const statuses = [res1?.status, res2?.status].sort();
      expect(statuses).toEqual([201, 409]);
    });

    it('rejects invalid date range where startDate > endDate', async () => {
      const response = await request(app)
        .post('/api/v1/admin/coupons')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'INVALIDDATES',
          discountType: 'FIXED_AMOUNT',
          discountValue: 50000,
          startDate: futureDate.toISOString(),
          endDate: pastDate.toISOString(),
        });

      expect(response.status).toBe(422);
    });

    it('updates coupon and rejects invalid limit reduction below usedCount', async () => {
      // 1. Create coupon with usedCount = 5
      const coupon = await prisma.coupon.create({
        data: {
          code: 'TESTUPDATE',
          discountType: 'PERCENTAGE',
          discountValue: 10n,
          usageLimit: 20,
          usedCount: 5,
          startDate: pastDate,
          endDate: futureDate,
        },
      });

      // 2. Attempt to update usageLimit to 3 (< usedCount 5) => Should fail with 400
      const invalidUpdateRes = await request(app)
        .patch(`/api/v1/admin/coupons/${coupon.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ usageLimit: 3 });

      expect(invalidUpdateRes.status).toBe(400);
      const error = errorResponseSchema.parse(invalidUpdateRes.body);
      expect(error.error.code).toBe(ERROR_CODES.INVALID_COUPON_LIMITS);

      // 3. Valid update
      const validUpdateRes = await request(app)
        .patch(`/api/v1/admin/coupons/${coupon.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ description: 'Updated description', usageLimit: 50 });

      expect(validUpdateRes.status).toBe(200);
      const parsed = couponDetailResponseSchema.parse(validUpdateRes.body);
      expect(parsed.data.coupon.description).toBe('Updated description');
      expect(parsed.data.coupon.usageLimit).toBe(50);
    });

    it('handles changing coupon from PERCENTAGE with maxDiscountAmount to FIXED_AMOUNT without DB 500', async () => {
      // 1. Create PERCENTAGE coupon with maxDiscountAmount = 100,000
      const coupon = await prisma.coupon.create({
        data: {
          code: 'CHANGE_TYPE',
          discountType: 'PERCENTAGE',
          discountValue: 20n,
          maxDiscountAmount: 100000n,
          startDate: pastDate,
          endDate: futureDate,
        },
      });

      // 2. Admin PATCH to FIXED_AMOUNT without providing maxDiscountAmount
      const updateRes = await request(app)
        .patch(`/api/v1/admin/coupons/${coupon.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          discountType: 'FIXED_AMOUNT',
          discountValue: 50000,
        });

      expect(updateRes.status).toBe(200);
      const parsed = couponDetailResponseSchema.parse(updateRes.body);
      expect(parsed.data.coupon.discountType).toBe('FIXED_AMOUNT');
      expect(parsed.data.coupon.discountValue).toBe('50000');
      expect(parsed.data.coupon.maxDiscountAmount).toBeNull();
    });

    it('prevents deleting a coupon that has already been used', async () => {
      const coupon = await prisma.coupon.create({
        data: {
          code: 'USEDCOUPON',
          discountType: 'FIXED_AMOUNT',
          discountValue: 100000n,
          usedCount: 1,
          startDate: pastDate,
          endDate: futureDate,
        },
      });

      const response = await request(app)
        .delete(`/api/v1/admin/coupons/${coupon.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(409);
      const error = errorResponseSchema.parse(response.body);
      expect(error.error.code).toBe(ERROR_CODES.COUPON_CANNOT_DELETE_USED);
    });

    it('deletes an unused coupon and returns success message', async () => {
      const coupon = await prisma.coupon.create({
        data: {
          code: 'UNUSED_COUPON',
          discountType: 'FIXED_AMOUNT',
          discountValue: 50000n,
          usedCount: 0,
          startDate: pastDate,
          endDate: futureDate,
        },
      });

      const response = await request(app)
        .delete(`/api/v1/admin/coupons/${coupon.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      const parsed = deleteCouponResponseSchema.parse(response.body);
      expect(parsed.data.message).toBeDefined();
    });

    it('lists and filters coupons with pagination', async () => {
      await prisma.coupon.createMany({
        data: [
          {
            code: 'CODE1',
            discountType: 'PERCENTAGE',
            discountValue: 10n,
            startDate: pastDate,
            endDate: futureDate,
            isActive: true,
          },
          {
            code: 'CODE2',
            discountType: 'FIXED_AMOUNT',
            discountValue: 50000n,
            startDate: pastDate,
            endDate: futureDate,
            isActive: false,
          },
        ],
      });

      const response = await request(app)
        .get('/api/v1/admin/coupons?isActive=true')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      const parsed = listCouponsResponseSchema.parse(response.body);
      expect(parsed.data.length).toBe(1);
      const [firstCoupon] = parsed.data;
      expect(firstCoupon?.code).toBe('CODE1');
    });
  });

  describe('Customer Coupon Validate & Preview (POST /api/v1/coupons/validate)', () => {
    it('validates PERCENTAGE coupon with max cap on active cart', async () => {
      // 1. User adds 1 item of 8,000,000 VND to cart
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ variantId: testVariant.id, quantity: 1 });

      // 2. Create coupon: 20% max 500,000 VND
      await prisma.coupon.create({
        data: {
          code: 'SAVE20',
          discountType: 'PERCENTAGE',
          discountValue: 20n, // 20% of 8,000,000 = 1,600,000 => Capped at 500,000
          maxDiscountAmount: 500000n,
          minOrderAmount: 1000000n,
          startDate: pastDate,
          endDate: futureDate,
          isActive: true,
        },
      });

      // 3. Customer previews coupon
      const response = await request(app)
        .post('/api/v1/coupons/validate')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ code: 'save20' });

      expect(response.status).toBe(200);
      const parsed = validateCouponResponseSchema.parse(response.body);
      expect(parsed.data.subtotal).toBe('8000000');
      expect(parsed.data.discountAmount).toBe('500000');
      expect(parsed.data.finalTotal).toBe('7500000');
    });

    it('rejects coupon when cart is empty', async () => {
      await prisma.coupon.create({
        data: {
          code: 'SAVE10',
          discountType: 'PERCENTAGE',
          discountValue: 10n,
          startDate: pastDate,
          endDate: futureDate,
        },
      });

      const response = await request(app)
        .post('/api/v1/coupons/validate')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ code: 'SAVE10' });

      expect(response.status).toBe(422);
      const error = errorResponseSchema.parse(response.body);
      expect(error.error.code).toBe(ERROR_CODES.CART_NO_AVAILABLE_ITEMS);
    });

    it('rejects coupon when subtotal is below minOrderAmount', async () => {
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ variantId: testVariant.id, quantity: 1 }); // 8,000,000 VND

      await prisma.coupon.create({
        data: {
          code: 'BIGORDER',
          discountType: 'FIXED_AMOUNT',
          discountValue: 1000000n,
          minOrderAmount: 20000000n, // Min 20,000,000 VND
          startDate: pastDate,
          endDate: futureDate,
        },
      });

      const response = await request(app)
        .post('/api/v1/coupons/validate')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ code: 'BIGORDER' });

      expect(response.status).toBe(422);
      const error = errorResponseSchema.parse(response.body);
      expect(error.error.code).toBe(ERROR_CODES.COUPON_MIN_ORDER_NOT_MET);
    });

    it('rejects not yet started coupon', async () => {
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ variantId: testVariant.id, quantity: 1 });

      await prisma.coupon.create({
        data: {
          code: 'FUTURE_COUPON',
          discountType: 'FIXED_AMOUNT',
          discountValue: 100000n,
          startDate: futureDate,
          endDate: farFutureDate,
        },
      });

      const response = await request(app)
        .post('/api/v1/coupons/validate')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ code: 'FUTURE_COUPON' });

      expect(response.status).toBe(422);
      const error = errorResponseSchema.parse(response.body);
      expect(error.error.code).toBe(ERROR_CODES.COUPON_NOT_STARTED);
    });

    it('rejects expired coupon', async () => {
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ variantId: testVariant.id, quantity: 1 });

      await prisma.coupon.create({
        data: {
          code: 'EXPIREDCODE',
          discountType: 'FIXED_AMOUNT',
          discountValue: 100000n,
          startDate: farPastDate,
          endDate: pastDate,
        },
      });

      const response = await request(app)
        .post('/api/v1/coupons/validate')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ code: 'EXPIREDCODE' });

      expect(response.status).toBe(422);
      const error = errorResponseSchema.parse(response.body);
      expect(error.error.code).toBe(ERROR_CODES.COUPON_EXPIRED);
    });

    it('rejects coupon when global usageLimit is exhausted', async () => {
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ variantId: testVariant.id, quantity: 1 });

      await prisma.coupon.create({
        data: {
          code: 'SOLD_OUT',
          discountType: 'FIXED_AMOUNT',
          discountValue: 100000n,
          usageLimit: 10,
          usedCount: 10, // Full
          startDate: pastDate,
          endDate: futureDate,
        },
      });

      const response = await request(app)
        .post('/api/v1/coupons/validate')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ code: 'SOLD_OUT' });

      expect(response.status).toBe(422);
      const error = errorResponseSchema.parse(response.body);
      expect(error.error.code).toBe(ERROR_CODES.COUPON_USAGE_LIMIT_EXCEEDED);
    });

    it('rejects coupon when user has already used up per-user quota', async () => {
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ variantId: testVariant.id, quantity: 1 });

      const coupon = await prisma.coupon.create({
        data: {
          code: 'ONCE_PER_USER',
          discountType: 'FIXED_AMOUNT',
          discountValue: 100000n,
          usageLimitPerUser: 1,
          startDate: pastDate,
          endDate: futureDate,
        },
      });

      // Record 1 usage for this customer
      await prisma.couponUsage.create({
        data: {
          couponId: coupon.id,
          userId: customerId,
          discountAmount: 100000n,
        },
      });

      const response = await request(app)
        .post('/api/v1/coupons/validate')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ code: 'ONCE_PER_USER' });

      expect(response.status).toBe(422);
      const error = errorResponseSchema.parse(response.body);
      expect(error.error.code).toBe(ERROR_CODES.COUPON_USER_LIMIT_EXCEEDED);
    });
  });
});
