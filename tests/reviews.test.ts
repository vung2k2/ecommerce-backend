import bcrypt from 'bcrypt';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
import { auditService } from '../src/modules/audit/audit.service.js';
import { jwtService } from '../src/utils/jwt.js';

const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

const reviewItemSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  orderItemId: z.string().uuid(),
  userId: z.string().uuid(),
  rating: z.number(),
  comment: z.string().nullable(),
  createdAt: z.string(),
  user: z.object({
    fullName: z.string(),
    avatarUrl: z.string().nullable(),
  }),
});

const createReviewResponseSchema = z.object({
  data: z.object({
    review: reviewItemSchema,
  }),
});

const productReviewsResponseSchema = z.object({
  data: z.object({
    items: z.array(reviewItemSchema),
    ratingSummary: z.object({
      averageRating: z.number(),
      totalReviews: z.number(),
      breakdown: z.record(z.string(), z.number()),
    }),
    total: z.number(),
    page: z.number(),
    pageSize: z.number(),
    totalPages: z.number(),
  }),
});

const adminReviewItemSchema = reviewItemSchema.extend({
  isVisible: z.boolean(),
  moderationReason: z.string().nullable(),
  moderatedById: z.string().uuid().nullable(),
  moderatedAt: z.string().nullable(),
  productName: z.string(),
  sku: z.string(),
});

const adminModerateResponseSchema = z.object({
  data: z.object({
    review: adminReviewItemSchema,
    message: z.string().optional(),
  }),
});

const adminListReviewsResponseSchema = z.object({
  data: z.array(adminReviewItemSchema),
  meta: z.object({
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

describe('Review Module Integration Tests', () => {
  const app = createApp();

  let adminToken: string;
  let staffWithModerateToken: string;
  let staffWithoutModerateToken: string;
  let customer1Token: string;
  let customer1Id: string;
  let customer2Token: string;

  let testCategory: { id: string };
  let testProduct: { id: string; name: string };
  let testVariant: { id: string; sku: string };

  let deliveredOrderItemId1: string;
  let deliveredOrderItemId2: string;
  let nonDeliveredOrderItemId: string;

  beforeEach(async () => {
    // Clear test tables in foreign key order
    await prisma.auditLog.deleteMany();
    await prisma.review.deleteMany();
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

    // Admin
    const admin = await prisma.user.create({
      data: {
        email: 'admin@review-test.com',
        passwordHash,
        fullName: 'Admin User',
        role: ROLES.ADMIN,
      },
    });
    adminToken = jwtService.signAccessToken({
      userId: admin.id,
      role: admin.role,
    });

    // Staff with review:moderate
    const staffWithModerate = await prisma.user.create({
      data: {
        email: 'staff-mod@review-test.com',
        passwordHash,
        fullName: 'Staff Moderator',
        role: ROLES.STAFF,
        permissions: {
          create: [{ permission: PERMISSIONS.REVIEW_MODERATE }],
        },
      },
    });
    staffWithModerateToken = jwtService.signAccessToken({
      userId: staffWithModerate.id,
      role: staffWithModerate.role,
    });

    // Staff without review:moderate
    const staffWithoutModerate = await prisma.user.create({
      data: {
        email: 'staff-nomod@review-test.com',
        passwordHash,
        fullName: 'Staff Regular',
        role: ROLES.STAFF,
      },
    });
    staffWithoutModerateToken = jwtService.signAccessToken({
      userId: staffWithoutModerate.id,
      role: staffWithoutModerate.role,
    });

    // Customers
    const customer1 = await prisma.user.create({
      data: {
        email: 'customer1@review-test.com',
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

    const customer2 = await prisma.user.create({
      data: {
        email: 'customer2@review-test.com',
        passwordHash,
        fullName: 'Customer Two',
        role: ROLES.CUSTOMER,
      },
    });
    customer2Token = jwtService.signAccessToken({
      userId: customer2.id,
      role: customer2.role,
    });

    // Setup Category, Product & Variant
    testCategory = await prisma.category.create({
      data: {
        name: 'Keyboards',
        slug: 'keyboards',
      },
    });

    testProduct = await prisma.product.create({
      data: {
        name: 'Mechanical Keyboard RGB',
        slug: 'mechanical-keyboard-rgb',
        status: 'ACTIVE',
        categoryId: testCategory.id,
      },
    });

    testVariant = await prisma.productVariant.create({
      data: {
        productId: testProduct.id,
        sku: 'KB-RGB-01',
        name: 'Blue Switch',
        price: 1500000n,
        isActive: true,
      },
    });

    // Create DELIVERED order for customer1
    const deliveredOrder = await prisma.order.create({
      data: {
        orderNumber: 'ORD-DELIVERED-001',
        userId: customer1.id,
        status: ORDER_STATUSES.DELIVERED,
        paymentMethod: PAYMENT_METHODS.COD,
        paymentStatus: PAYMENT_STATUSES.PAID,
        subtotalAmount: 3000000n,
        discountAmount: 0n,
        shippingFee: 30000n,
        totalAmount: 3030000n,
        recipientName: 'Customer One',
        phone: '0987654321',
        province: 'Hanoi',
        district: 'Cau Giay',
        ward: 'Dich Vong',
        streetAddress: '123 Xuan Thuy',
        items: {
          create: [
            {
              variantId: testVariant.id,
              productName: testProduct.name,
              sku: testVariant.sku,
              unitPrice: 1500000n,
              quantity: 1,
              totalPrice: 1500000n,
            },
            {
              variantId: testVariant.id,
              productName: testProduct.name,
              sku: testVariant.sku,
              unitPrice: 1500000n,
              quantity: 1,
              totalPrice: 1500000n,
            },
          ],
        },
      },
      include: { items: true },
    });

    deliveredOrderItemId1 = deliveredOrder.items[0]?.id ?? '';
    deliveredOrderItemId2 = deliveredOrder.items[1]?.id ?? '';

    // Create PROCESSING (non-delivered) order for customer1
    const processingOrder = await prisma.order.create({
      data: {
        orderNumber: 'ORD-PROCESSING-002',
        userId: customer1.id,
        status: ORDER_STATUSES.PROCESSING,
        paymentMethod: PAYMENT_METHODS.COD,
        paymentStatus: PAYMENT_STATUSES.PENDING,
        subtotalAmount: 1500000n,
        discountAmount: 0n,
        shippingFee: 30000n,
        totalAmount: 1530000n,
        recipientName: 'Customer One',
        phone: '0987654321',
        province: 'Hanoi',
        district: 'Cau Giay',
        ward: 'Dich Vong',
        streetAddress: '123 Xuan Thuy',
        items: {
          create: [
            {
              variantId: testVariant.id,
              productName: testProduct.name,
              sku: testVariant.sku,
              unitPrice: 1500000n,
              quantity: 1,
              totalPrice: 1500000n,
            },
          ],
        },
      },
      include: { items: true },
    });

    nonDeliveredOrderItemId = processingOrder.items[0]?.id ?? '';
  });

  describe('POST /api/v1/products/:productId/reviews', () => {
    it('returns 401 when not authenticated', async () => {
      const response = await request(app).post(`/api/v1/products/${testProduct.id}/reviews`).send({
        orderItemId: deliveredOrderItemId1,
        rating: 5,
        comment: 'Good product',
      });

      expect(response.status).toBe(401);
    });

    it('returns 404 when order item belongs to another customer', async () => {
      const response = await request(app)
        .post(`/api/v1/products/${testProduct.id}/reviews`)
        .set('Authorization', `Bearer ${customer2Token}`)
        .send({
          orderItemId: deliveredOrderItemId1,
          rating: 5,
        });

      expect(response.status).toBe(404);
      const parsed = errorResponseSchema.parse(response.body);
      expect(parsed.error.code).toBe(ERROR_CODES.ORDER_ITEM_NOT_FOUND);
    });

    it('returns 400 when order is not yet DELIVERED', async () => {
      const response = await request(app)
        .post(`/api/v1/products/${testProduct.id}/reviews`)
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          orderItemId: nonDeliveredOrderItemId,
          rating: 4,
          comment: 'Not delivered yet',
        });

      expect(response.status).toBe(400);
      const parsed = errorResponseSchema.parse(response.body);
      expect(parsed.error.code).toBe(ERROR_CODES.ORDER_NOT_DELIVERED);
    });

    it('returns 404 when product id does not match order item variant product', async () => {
      const otherProduct = await prisma.product.create({
        data: {
          name: 'Gaming Mouse',
          slug: 'gaming-mouse',
          status: 'ACTIVE',
          categoryId: testCategory.id,
        },
      });

      const response = await request(app)
        .post(`/api/v1/products/${otherProduct.id}/reviews`)
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          orderItemId: deliveredOrderItemId1,
          rating: 5,
        });

      expect(response.status).toBe(404);
      const parsed = errorResponseSchema.parse(response.body);
      expect(parsed.error.code).toBe(ERROR_CODES.ORDER_ITEM_NOT_FOUND);
    });

    it('returns 404 when order item variant has been deleted (variantId is null)', async () => {
      // Simulate variant deletion leading to SetNull on orderItem.variantId
      await prisma.orderItem.update({
        where: { id: deliveredOrderItemId2 },
        data: { variantId: null },
      });

      const response = await request(app)
        .post(`/api/v1/products/${testProduct.id}/reviews`)
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          orderItemId: deliveredOrderItemId2,
          rating: 5,
        });

      expect(response.status).toBe(404);
      const parsed = errorResponseSchema.parse(response.body);
      expect(parsed.error.code).toBe(ERROR_CODES.ORDER_ITEM_NOT_FOUND);
    });

    it('creates review successfully for delivered order item', async () => {
      const response = await request(app)
        .post(`/api/v1/products/${testProduct.id}/reviews`)
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          orderItemId: deliveredOrderItemId1,
          rating: 5,
          comment: 'Sản phẩm gõ rất êm, đèn LED đẹp rực rỡ!',
        });

      expect(response.status).toBe(201);
      const parsed = createReviewResponseSchema.parse(response.body);
      expect(parsed.data.review.rating).toBe(5);
      expect(parsed.data.review.comment).toBe('Sản phẩm gõ rất êm, đèn LED đẹp rực rỡ!');
      expect(parsed.data.review.user.fullName).toBe('Customer One');

      const saved = await prisma.review.findUnique({
        where: { orderItemId: deliveredOrderItemId1 },
      });
      expect(saved).not.toBeNull();
      expect(saved?.rating).toBe(5);
    });

    it('rejects duplicate review on the same order item with 409', async () => {
      // First review
      await request(app)
        .post(`/api/v1/products/${testProduct.id}/reviews`)
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          orderItemId: deliveredOrderItemId1,
          rating: 5,
          comment: 'Lần 1',
        });

      // Second review for same order item
      const response = await request(app)
        .post(`/api/v1/products/${testProduct.id}/reviews`)
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          orderItemId: deliveredOrderItemId1,
          rating: 3,
          comment: 'Lần 2 trùng lặp',
        });

      expect(response.status).toBe(409);
      const parsed = errorResponseSchema.parse(response.body);
      expect(parsed.error.code).toBe(ERROR_CODES.REVIEW_ALREADY_EXISTS);
    });

    it('handles concurrent review requests safely (only one succeeds)', async () => {
      const requests = [
        request(app)
          .post(`/api/v1/products/${testProduct.id}/reviews`)
          .set('Authorization', `Bearer ${customer1Token}`)
          .send({ orderItemId: deliveredOrderItemId1, rating: 5, comment: 'Concurrent 1' }),
        request(app)
          .post(`/api/v1/products/${testProduct.id}/reviews`)
          .set('Authorization', `Bearer ${customer1Token}`)
          .send({ orderItemId: deliveredOrderItemId1, rating: 4, comment: 'Concurrent 2' }),
      ];

      const responses = await Promise.all(requests);
      const statuses = responses.map((r) => r.status).sort();

      expect(statuses).toEqual([201, 409]);
    });
  });

  describe('GET /api/v1/products/:productId/reviews', () => {
    it('returns paginated public reviews and rating summary', async () => {
      // Create two reviews
      await prisma.review.createMany({
        data: [
          {
            userId: customer1Id,
            productId: testProduct.id,
            orderItemId: deliveredOrderItemId1,
            rating: 5,
            comment: 'Review 5 sao',
            isVisible: true,
          },
          {
            userId: customer1Id,
            productId: testProduct.id,
            orderItemId: deliveredOrderItemId2,
            rating: 4,
            comment: 'Review 4 sao',
            isVisible: true,
          },
        ],
      });

      const response = await request(app).get(`/api/v1/products/${testProduct.id}/reviews`);

      expect(response.status).toBe(200);
      const parsed = productReviewsResponseSchema.parse(response.body);
      expect(parsed.data.total).toBe(2);
      expect(parsed.data.ratingSummary.averageRating).toBe(4.5);
      expect(parsed.data.ratingSummary.totalReviews).toBe(2);
      expect(parsed.data.ratingSummary.breakdown['5']).toBe(1);
      expect(parsed.data.ratingSummary.breakdown['4']).toBe(1);
      expect(parsed.data.items).toHaveLength(2);
    });

    it('excludes hidden (moderated) reviews from public list', async () => {
      await prisma.review.create({
        data: {
          userId: customer1Id,
          productId: testProduct.id,
          orderItemId: deliveredOrderItemId1,
          rating: 1,
          comment: 'Review vi phạm bị ẩn',
          isVisible: false,
          moderationReason: 'Spam',
        },
      });

      const response = await request(app).get(`/api/v1/products/${testProduct.id}/reviews`);

      expect(response.status).toBe(200);
      const parsed = productReviewsResponseSchema.parse(response.body);
      expect(parsed.data.total).toBe(0);
      expect(parsed.data.items).toHaveLength(0);
    });
  });

  describe('Admin Review Moderation', () => {
    let reviewId: string;

    beforeEach(async () => {
      const review = await prisma.review.create({
        data: {
          userId: customer1Id,
          productId: testProduct.id,
          orderItemId: deliveredOrderItemId1,
          rating: 2,
          comment: 'Spam link quảng cáo',
          isVisible: true,
        },
      });
      reviewId = review.id;
    });

    it('returns 403 when customer or unauthorized staff attempts moderation', async () => {
      const resCustomer = await request(app)
        .patch(`/api/v1/admin/reviews/${reviewId}/moderate`)
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ isVisible: false, reason: 'Spam' });
      expect(resCustomer.status).toBe(403);

      const resStaff = await request(app)
        .patch(`/api/v1/admin/reviews/${reviewId}/moderate`)
        .set('Authorization', `Bearer ${staffWithoutModerateToken}`)
        .send({ isVisible: false, reason: 'Spam' });
      expect(resStaff.status).toBe(403);
    });

    it('allows staff with review:moderate to hide review with reason and records audit log', async () => {
      const response = await request(app)
        .patch(`/api/v1/admin/reviews/${reviewId}/moderate`)
        .set('Authorization', `Bearer ${staffWithModerateToken}`)
        .send({
          isVisible: false,
          reason: 'Chứa liên kết quảng cáo vi phạm chính sách',
        });

      expect(response.status).toBe(200);
      const parsed = adminModerateResponseSchema.parse(response.body);
      expect(parsed.data.review.isVisible).toBe(false);
      expect(parsed.data.review.moderationReason).toBe(
        'Chứa liên kết quảng cáo vi phạm chính sách',
      );

      // Verify audit log
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          action: AUDIT_ACTIONS.REVIEW_MODERATED,
          targetId: reviewId,
        },
      });
      expect(auditLog).not.toBeNull();
      expect(auditLog?.targetType).toBe('REVIEW');
    });

    it('rolls back review moderation when audit log recording fails', async () => {
      const auditSpy = vi
        .spyOn(auditService, 'record')
        .mockRejectedValueOnce(new Error('Audit DB failure'));

      const response = await request(app)
        .patch(`/api/v1/admin/reviews/${reviewId}/moderate`)
        .set('Authorization', `Bearer ${staffWithModerateToken}`)
        .send({
          isVisible: false,
          reason: 'Spam review rollback test',
        });

      expect(response.status).toBe(500);

      // Verify review state was not updated (rolled back)
      const untouched = await prisma.review.findUnique({
        where: { id: reviewId },
      });
      expect(untouched?.isVisible).toBe(true);
      expect(untouched?.moderationReason).toBeNull();
      expect(untouched?.moderatedById).toBeNull();

      auditSpy.mockRestore();
    });

    it('allows admin to list all reviews including hidden ones', async () => {
      await prisma.review.update({
        where: { id: reviewId },
        data: { isVisible: false, moderationReason: 'Hidden' },
      });

      const response = await request(app)
        .get('/api/v1/admin/reviews')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      const parsed = adminListReviewsResponseSchema.parse(response.body);
      expect(parsed.data).toHaveLength(1);
      expect(parsed.data[0]?.isVisible).toBe(false);
      expect(parsed.data[0]?.productName).toBe(testProduct.name);
    });
  });
});
