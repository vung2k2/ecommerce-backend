import bcrypt from 'bcrypt';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import {
  ERROR_CODES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PERMISSIONS,
  ROLES,
} from '../src/constants/index.js';
import { prisma } from '../src/database/prisma.js';
import { jwtService } from '../src/utils/jwt.js';

const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

const salesOverviewResponseSchema = z.object({
  data: z.object({
    totalRevenue: z.string(),
    totalOrders: z.number(),
    totalItemsSold: z.number(),
    averageOrderValue: z.string(),
    dailyBreakdown: z.array(
      z.object({
        date: z.string(),
        revenue: z.string(),
        ordersCount: z.number(),
      }),
    ),
  }),
});

const topProductsResponseSchema = z.object({
  data: z.object({
    products: z.array(
      z.object({
        productId: z.string().nullable(),
        productName: z.string(),
        unitsSold: z.number(),
        totalRevenue: z.string(),
      }),
    ),
  }),
});

describe('Admin/Staff Reports Module Integration Tests', () => {
  const app = createApp();

  let adminToken: string;
  let staffWithReportToken: string;
  let staffWithoutReportToken: string;
  let customerToken: string;

  let testCategory: { id: string };
  let productA: { id: string; name: string };
  let productB: { id: string; name: string };
  let variantA1: { id: string; sku: string };
  let variantA2: { id: string; sku: string };
  let variantB: { id: string; sku: string };

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
        email: 'admin@report-test.com',
        passwordHash,
        fullName: 'Admin User',
        role: ROLES.ADMIN,
      },
    });
    adminToken = jwtService.signAccessToken({
      userId: admin.id,
      role: admin.role,
    });

    // Staff with report:read
    const staffWithReport = await prisma.user.create({
      data: {
        email: 'staff-report@report-test.com',
        passwordHash,
        fullName: 'Staff Analyst',
        role: ROLES.STAFF,
        permissions: {
          create: [{ permission: PERMISSIONS.REPORT_READ }],
        },
      },
    });
    staffWithReportToken = jwtService.signAccessToken({
      userId: staffWithReport.id,
      role: staffWithReport.role,
    });

    // Staff without report:read
    const staffWithoutReport = await prisma.user.create({
      data: {
        email: 'staff-noreport@report-test.com',
        passwordHash,
        fullName: 'Staff Normal',
        role: ROLES.STAFF,
      },
    });
    staffWithoutReportToken = jwtService.signAccessToken({
      userId: staffWithoutReport.id,
      role: staffWithoutReport.role,
    });

    // Customer
    const customer = await prisma.user.create({
      data: {
        email: 'customer@report-test.com',
        passwordHash,
        fullName: 'Customer User',
        role: ROLES.CUSTOMER,
      },
    });
    customerToken = jwtService.signAccessToken({
      userId: customer.id,
      role: customer.role,
    });

    // Catalog setup
    testCategory = await prisma.category.create({
      data: { name: 'Audio', slug: 'audio' },
    });

    productA = await prisma.product.create({
      data: {
        name: 'Headphone Pro Wireless',
        slug: 'headphone-pro-wireless',
        status: 'ACTIVE',
        categoryId: testCategory.id,
      },
    });

    // Product A has two variants: Black and Silver
    variantA1 = await prisma.productVariant.create({
      data: {
        productId: productA.id,
        sku: 'HP-PRO-BLK',
        name: 'Black',
        price: 2000000n,
        isActive: true,
      },
    });

    variantA2 = await prisma.productVariant.create({
      data: {
        productId: productA.id,
        sku: 'HP-PRO-SLV',
        name: 'Silver',
        price: 2000000n,
        isActive: true,
      },
    });

    productB = await prisma.product.create({
      data: {
        name: 'Earbuds Basic',
        slug: 'earbuds-basic',
        status: 'ACTIVE',
        categoryId: testCategory.id,
      },
    });

    variantB = await prisma.productVariant.create({
      data: {
        productId: productB.id,
        sku: 'EB-BASIC-WHT',
        name: 'White',
        price: 500000n,
        isActive: true,
      },
    });

    // Create delivered order 1 (Delivered on Sep 10, Total: 4,000,000 VND - 2 units of Variant A1)
    await prisma.order.create({
      data: {
        orderNumber: 'ORD-DEL-1',
        userId: customer.id,
        status: ORDER_STATUSES.DELIVERED,
        paymentMethod: PAYMENT_METHODS.STRIPE,
        paymentStatus: PAYMENT_STATUSES.PAID,
        subtotalAmount: 4000000n,
        discountAmount: 0n,
        shippingFee: 0n,
        totalAmount: 4000000n,
        recipientName: 'Customer',
        phone: '0987654321',
        province: 'Hanoi',
        district: 'Cau Giay',
        ward: 'Dich Vong',
        streetAddress: '123 Xuan Thuy',
        createdAt: new Date('2026-09-08T10:00:00.000Z'),
        deliveredAt: new Date('2026-09-10T10:00:00.000Z'),
        items: {
          create: [
            {
              variantId: variantA1.id,
              productName: productA.name,
              sku: variantA1.sku,
              unitPrice: 2000000n,
              quantity: 2,
              totalPrice: 4000000n,
            },
          ],
        },
      },
    });

    // Create delivered order 2 (Delivered on Sep 15, Total: 1,500,000 VND - 3 units of Variant B)
    await prisma.order.create({
      data: {
        orderNumber: 'ORD-DEL-2',
        userId: customer.id,
        status: ORDER_STATUSES.DELIVERED,
        paymentMethod: PAYMENT_METHODS.COD,
        paymentStatus: PAYMENT_STATUSES.PAID,
        subtotalAmount: 1500000n,
        discountAmount: 0n,
        shippingFee: 0n,
        totalAmount: 1500000n,
        recipientName: 'Customer',
        phone: '0987654321',
        province: 'Hanoi',
        district: 'Cau Giay',
        ward: 'Dich Vong',
        streetAddress: '123 Xuan Thuy',
        createdAt: new Date('2026-09-14T15:00:00.000Z'),
        deliveredAt: new Date('2026-09-15T15:00:00.000Z'),
        items: {
          create: [
            {
              variantId: variantB.id,
              productName: productB.name,
              sku: variantB.sku,
              unitPrice: 500000n,
              quantity: 3,
              totalPrice: 1500000n,
            },
          ],
        },
      },
    });

    // Create delivered order 3 (Delivered on Sep 20, Total: 2,000,000 VND - 1 unit of Variant A2)
    // This will test product-level aggregation: Product A will have 2 (A1) + 1 (A2) = 3 units sold!
    await prisma.order.create({
      data: {
        orderNumber: 'ORD-DEL-3',
        userId: customer.id,
        status: ORDER_STATUSES.DELIVERED,
        paymentMethod: PAYMENT_METHODS.COD,
        paymentStatus: PAYMENT_STATUSES.PAID,
        subtotalAmount: 2000000n,
        discountAmount: 0n,
        shippingFee: 0n,
        totalAmount: 2000000n,
        recipientName: 'Customer',
        phone: '0987654321',
        province: 'Hanoi',
        district: 'Cau Giay',
        ward: 'Dich Vong',
        streetAddress: '123 Xuan Thuy',
        createdAt: new Date('2026-09-19T10:00:00.000Z'),
        deliveredAt: new Date('2026-09-20T10:00:00.000Z'),
        items: {
          create: [
            {
              variantId: variantA2.id,
              productName: productA.name,
              sku: variantA2.sku,
              unitPrice: 2000000n,
              quantity: 1,
              totalPrice: 2000000n,
            },
          ],
        },
      },
    });

    // Create CANCELLED order (Must be EXCLUDED from reports)
    await prisma.order.create({
      data: {
        orderNumber: 'ORD-CANCELLED-4',
        userId: customer.id,
        status: ORDER_STATUSES.CANCELLED,
        paymentMethod: PAYMENT_METHODS.COD,
        paymentStatus: PAYMENT_STATUSES.FAILED,
        subtotalAmount: 10000000n,
        discountAmount: 0n,
        shippingFee: 0n,
        totalAmount: 10000000n,
        recipientName: 'Customer',
        phone: '0987654321',
        province: 'Hanoi',
        district: 'Cau Giay',
        ward: 'Dich Vong',
        streetAddress: '123 Xuan Thuy',
        createdAt: new Date('2026-09-12T10:00:00.000Z'),
        items: {
          create: [
            {
              variantId: variantA1.id,
              productName: productA.name,
              sku: variantA1.sku,
              unitPrice: 2000000n,
              quantity: 5,
              totalPrice: 10000000n,
            },
          ],
        },
      },
    });

    // Create PROCESSING order (Must be EXCLUDED from reports)
    await prisma.order.create({
      data: {
        orderNumber: 'ORD-PROCESSING-5',
        userId: customer.id,
        status: ORDER_STATUSES.PROCESSING,
        paymentMethod: PAYMENT_METHODS.STRIPE,
        paymentStatus: PAYMENT_STATUSES.PAID,
        subtotalAmount: 2000000n,
        discountAmount: 0n,
        shippingFee: 0n,
        totalAmount: 2000000n,
        recipientName: 'Customer',
        phone: '0987654321',
        province: 'Hanoi',
        district: 'Cau Giay',
        ward: 'Dich Vong',
        streetAddress: '123 Xuan Thuy',
        createdAt: new Date('2026-09-18T10:00:00.000Z'),
        items: {
          create: [
            {
              variantId: variantA1.id,
              productName: productA.name,
              sku: variantA1.sku,
              unitPrice: 2000000n,
              quantity: 1,
              totalPrice: 2000000n,
            },
          ],
        },
      },
    });
  });

  describe('Authorization checks', () => {
    it('returns 401 when not logged in', async () => {
      const response = await request(app).get('/api/v1/admin/reports/sales');
      expect(response.status).toBe(401);
    });

    it('returns 403 when customer attempts to access reports', async () => {
      const response = await request(app)
        .get('/api/v1/admin/reports/sales')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(response.status).toBe(403);
    });

    it('returns 403 when staff lacks report:read permission', async () => {
      const response = await request(app)
        .get('/api/v1/admin/reports/sales')
        .set('Authorization', `Bearer ${staffWithoutReportToken}`);
      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/v1/admin/reports/sales', () => {
    it('returns 400 when startDate is after endDate', async () => {
      const response = await request(app)
        .get('/api/v1/admin/reports/sales')
        .set('Authorization', `Bearer ${staffWithReportToken}`)
        .query({
          startDate: '2026-09-20T00:00:00.000Z',
          endDate: '2026-09-10T00:00:00.000Z',
        });

      expect(response.status).toBe(400);
      const parsed = errorResponseSchema.parse(response.body);
      expect(parsed.error.code).toBe(ERROR_CODES.INVALID_REPORT_DATE_RANGE);
    });

    it('calculates sales overview strictly from DELIVERED orders', async () => {
      const response = await request(app)
        .get('/api/v1/admin/reports/sales')
        .set('Authorization', `Bearer ${staffWithReportToken}`);

      expect(response.status).toBe(200);
      const parsed = salesOverviewResponseSchema.parse(response.body);
      const data = parsed.data;

      // DELIVERED 1 (4,000,000) + DELIVERED 2 (1,500,000) + DELIVERED 3 (2,000,000) = 7,500,000 VND
      // Cancelled & Processing are completely excluded
      expect(data.totalRevenue).toBe('7500000');
      expect(data.totalOrders).toBe(3);
      expect(data.totalItemsSold).toBe(6); // 2 of A1 + 3 of B + 1 of A2
      expect(data.averageOrderValue).toBe('2500000'); // 7,500,000 / 3
      expect(data.dailyBreakdown).toHaveLength(3);
      expect(data.dailyBreakdown[0]?.date).toBe('2026-09-10');
      expect(data.dailyBreakdown[0]?.revenue).toBe('4000000');
      expect(data.dailyBreakdown[1]?.date).toBe('2026-09-15');
      expect(data.dailyBreakdown[1]?.revenue).toBe('1500000');
      expect(data.dailyBreakdown[2]?.date).toBe('2026-09-20');
      expect(data.dailyBreakdown[2]?.revenue).toBe('2000000');
    });

    it('recognizes revenue at delivery time, not order placement time (Finding 1)', async () => {
      // Create an order placed in August (2026-08-31) but delivered in September (2026-09-02)
      await prisma.order.create({
        data: {
          orderNumber: 'ORD-AUG-DEL-SEP',
          userId: (
            await prisma.user.findFirstOrThrow({ where: { email: 'customer@report-test.com' } })
          ).id,
          status: ORDER_STATUSES.DELIVERED,
          paymentMethod: PAYMENT_METHODS.COD,
          paymentStatus: PAYMENT_STATUSES.PAID,
          subtotalAmount: 1000000n,
          discountAmount: 0n,
          shippingFee: 0n,
          totalAmount: 1000000n,
          recipientName: 'Customer',
          phone: '0987654321',
          province: 'Hanoi',
          district: 'Cau Giay',
          ward: 'Dich Vong',
          streetAddress: '123 Xuan Thuy',
          createdAt: new Date('2026-08-31T20:00:00.000Z'),
          deliveredAt: new Date('2026-09-02T10:00:00.000Z'),
          items: {
            create: [
              {
                variantId: variantB.id,
                productName: productB.name,
                sku: variantB.sku,
                unitPrice: 500000n,
                quantity: 2,
                totalPrice: 1000000n,
              },
            ],
          },
        },
      });

      // Querying August (2026-08-01 to 2026-08-31): must NOT include this order (revenue = 0)
      const resAugust = await request(app)
        .get('/api/v1/admin/reports/sales')
        .set('Authorization', `Bearer ${staffWithReportToken}`)
        .query({
          startDate: '2026-08-01T00:00:00.000Z',
          endDate: '2026-08-31T23:59:59.999Z',
        });
      const parsedAugust = salesOverviewResponseSchema.parse(resAugust.body);
      expect(parsedAugust.data.totalRevenue).toBe('0');
      expect(parsedAugust.data.totalOrders).toBe(0);

      // Querying September (2026-09-01 to 2026-09-05): MUST include this order on 2026-09-02
      const resSeptember = await request(app)
        .get('/api/v1/admin/reports/sales')
        .set('Authorization', `Bearer ${staffWithReportToken}`)
        .query({
          startDate: '2026-09-01T00:00:00.000Z',
          endDate: '2026-09-05T23:59:59.999Z',
        });
      const parsedSeptember = salesOverviewResponseSchema.parse(resSeptember.body);
      expect(parsedSeptember.data.totalRevenue).toBe('1000000');
      expect(parsedSeptember.data.totalOrders).toBe(1);
      expect(parsedSeptember.data.dailyBreakdown[0]?.date).toBe('2026-09-02');
    });

    it('filters sales by date range properly', async () => {
      const response = await request(app)
        .get('/api/v1/admin/reports/sales')
        .set('Authorization', `Bearer ${staffWithReportToken}`)
        .query({
          startDate: '2026-09-14T00:00:00.000Z',
          endDate: '2026-09-16T00:00:00.000Z',
        });

      expect(response.status).toBe(200);
      const parsed = salesOverviewResponseSchema.parse(response.body);
      const data = parsed.data;
      expect(data.totalRevenue).toBe('1500000');
      expect(data.totalOrders).toBe(1);
    });
  });

  describe('GET /api/v1/admin/reports/top-products', () => {
    it('ranks by Product instead of SKU, summing variants of the same product (Finding 2)', async () => {
      const response = await request(app)
        .get('/api/v1/admin/reports/top-products')
        .set('Authorization', `Bearer ${staffWithReportToken}`);

      expect(response.status).toBe(200);
      const parsed = topProductsResponseSchema.parse(response.body);
      const products = parsed.data.products;

      // Both Product A and Product B sold 3 units:
      // Product A sold: 2 units (Variant A1) + 1 unit (Variant A2) = 3 units total, Revenue: 6,000,000
      // Product B sold: 3 units (Variant B), Revenue: 1,500,000
      expect(products).toHaveLength(2);

      // Product A has higher revenue (6,000,000 > 1,500,000), so it ranks #1
      expect(products[0]?.productId).toBe(productA.id);
      expect(products[0]?.productName).toBe(productA.name);
      expect(products[0]?.unitsSold).toBe(3);
      expect(products[0]?.totalRevenue).toBe('6000000');

      expect(products[1]?.productId).toBe(productB.id);
      expect(products[1]?.productName).toBe(productB.name);
      expect(products[1]?.unitsSold).toBe(3);
      expect(products[1]?.totalRevenue).toBe('1500000');
    });

    it('limits results according to limit query parameter', async () => {
      const response = await request(app)
        .get('/api/v1/admin/reports/top-products')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ limit: 1 });

      expect(response.status).toBe(200);
      const parsed = topProductsResponseSchema.parse(response.body);
      expect(parsed.data.products).toHaveLength(1);
      expect(parsed.data.products[0]?.productId).toBe(productA.id);
    });
  });
});
