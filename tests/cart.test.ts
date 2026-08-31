import bcrypt from 'bcrypt';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import { ERROR_CODES, ROLES } from '../src/constants/index.js';
import { prisma } from '../src/database/prisma.js';
import { jwtService } from '../src/utils/jwt.js';

// ==================== Response Schemas for Testing ====================

const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

const cartItemSchema = z.object({
  id: z.string().uuid(),
  variantId: z.string().uuid(),
  quantity: z.number().int(),
  unitPrice: z.string(),
  itemSubtotal: z.string(),
  isAvailable: z.boolean(),
  warningReason: z.string().nullable(),
  variant: z.object({
    id: z.string().uuid(),
    sku: z.string(),
    name: z.string(),
    price: z.string(),
    isActive: z.boolean(),
    availableStock: z.number().int(),
  }),
});

const cartResponseSchema = z.object({
  data: z.object({
    id: z.string().uuid(),
    items: z.array(cartItemSchema),
    totalItems: z.number().int(),
    availableItemCount: z.number().int(),
    unavailableItemCount: z.number().int(),
    hasUnavailableItems: z.boolean(),
    subtotal: z.string(),
  }),
});

describe('Cart Module Integration Tests', () => {
  const app = createApp();

  let user1Token: string;
  let user2Token: string;

  let activeProduct: { id: string };
  let variant1: { id: string; price: bigint };
  let variant2: { id: string; price: bigint };
  let inactiveVariant: { id: string };

  beforeEach(async () => {
    // Clear test tables
    await prisma.paymentTransaction.deleteMany();
    await prisma.orderStatusHistory.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.couponUsage.deleteMany();
    await prisma.coupon.deleteMany();
    await prisma.cartItem.deleteMany();
    await prisma.cart.deleteMany();
    await prisma.stockMovement.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.user.deleteMany();

    const passwordHash = await bcrypt.hash('Password123!', 10);

    // Create User 1
    const user1 = await prisma.user.create({
      data: {
        email: 'user1@cart-test.com',
        passwordHash,
        fullName: 'Customer One',
        role: ROLES.CUSTOMER,
      },
    });
    user1Token = jwtService.signAccessToken({ userId: user1.id, role: user1.role });

    // Create User 2
    const user2 = await prisma.user.create({
      data: {
        email: 'user2@cart-test.com',
        passwordHash,
        fullName: 'Customer Two',
        role: ROLES.CUSTOMER,
      },
    });
    user2Token = jwtService.signAccessToken({ userId: user2.id, role: user2.role });

    // Create Category & Products
    const category = await prisma.category.create({
      data: { name: 'Smartphones', slug: 'smartphones' },
    });

    activeProduct = await prisma.product.create({
      data: {
        name: 'iPhone 15',
        slug: 'iphone-15',
        status: 'ACTIVE',
        categoryId: category.id,
      },
    });

    variant1 = await prisma.productVariant.create({
      data: {
        productId: activeProduct.id,
        sku: 'IP15-128-BLK',
        name: 'iPhone 15 128GB Black',
        price: 20000000n, // 20,000,000 VND
        isActive: true,
      },
    });

    // Variant 1 Inventory: 10 on hand, 0 reserved => 10 available
    await prisma.inventory.create({
      data: {
        variantId: variant1.id,
        onHand: 10,
        reserved: 0,
      },
    });

    variant2 = await prisma.productVariant.create({
      data: {
        productId: activeProduct.id,
        sku: 'IP15-256-BLU',
        name: 'iPhone 15 256GB Blue',
        price: 23000000n, // 23,000,000 VND
        isActive: true,
      },
    });

    // Variant 2 Inventory: 5 on hand, 2 reserved => 3 available
    await prisma.inventory.create({
      data: {
        variantId: variant2.id,
        onHand: 5,
        reserved: 2,
      },
    });

    inactiveVariant = await prisma.productVariant.create({
      data: {
        productId: activeProduct.id,
        sku: 'IP15-INACTIVE',
        name: 'iPhone 15 Inactive',
        price: 15000000n,
        isActive: false,
      },
    });
  });

  describe('GET /api/v1/cart', () => {
    it('returns 401 when not authenticated', async () => {
      const response = await request(app).get('/api/v1/cart');
      expect(response.status).toBe(401);
    });

    it('returns empty cart when user has no items', async () => {
      const response = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${user1Token}`);

      expect(response.status).toBe(200);
      const parsed = cartResponseSchema.parse(response.body);
      expect(parsed.data.items).toEqual([]);
      expect(parsed.data.totalItems).toBe(0);
      expect(parsed.data.subtotal).toBe('0');
      expect(parsed.data.hasUnavailableItems).toBe(false);
    });
  });

  describe('POST /api/v1/cart/items (Add to Cart)', () => {
    it('adds item to cart successfully and calculates subtotal', async () => {
      const response = await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          variantId: variant1.id,
          quantity: 2,
        });

      expect(response.status).toBe(200);
      const parsed = cartResponseSchema.parse(response.body);
      expect(parsed.data.items.length).toBe(1);
      const [firstItem] = parsed.data.items;
      expect(firstItem?.variantId).toBe(variant1.id);
      expect(firstItem?.quantity).toBe(2);
      expect(firstItem?.unitPrice).toBe('20000000');
      expect(firstItem?.itemSubtotal).toBe('40000000');
      expect(parsed.data.subtotal).toBe('40000000');
      expect(parsed.data.totalItems).toBe(2);
      expect(firstItem?.isAvailable).toBe(true);
    });

    it('increments quantity when adding the same variant again', async () => {
      // Add 2 items
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ variantId: variant1.id, quantity: 2 });

      // Add 3 more items
      const response = await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ variantId: variant1.id, quantity: 3 });

      expect(response.status).toBe(200);
      const parsed = cartResponseSchema.parse(response.body);
      expect(parsed.data.items.length).toBe(1);
      const [firstItem] = parsed.data.items;
      expect(firstItem?.quantity).toBe(5);
      expect(firstItem?.itemSubtotal).toBe('100000000'); // 5 * 20,000,000
      expect(parsed.data.subtotal).toBe('100000000');
    });

    it('handles concurrent add to cart requests without lost updates', async () => {
      // 2 concurrent requests each adding 2 items of variant1 (starting from 0)
      const results = await Promise.all([
        request(app)
          .post('/api/v1/cart/items')
          .set('Authorization', `Bearer ${user1Token}`)
          .send({ variantId: variant1.id, quantity: 2 }),
        request(app)
          .post('/api/v1/cart/items')
          .set('Authorization', `Bearer ${user1Token}`)
          .send({ variantId: variant1.id, quantity: 2 }),
      ]);

      expect(results[0]?.status).toBe(200);
      expect(results[1]?.status).toBe(200);

      // Verify final cart state: total quantity must be exactly 4
      const finalCartRes = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${user1Token}`);

      const parsed = cartResponseSchema.parse(finalCartRes.body);
      expect(parsed.data.items.length).toBe(1);
      const [firstItem] = parsed.data.items;
      expect(firstItem?.quantity).toBe(4);
      expect(parsed.data.subtotal).toBe('80000000');
    });

    it('rejects adding inactive variant', async () => {
      const response = await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ variantId: inactiveVariant.id, quantity: 1 });

      expect(response.status).toBe(422);
      const error = errorResponseSchema.parse(response.body);
      expect(error.error.code).toBe(ERROR_CODES.VARIANT_INACTIVE);
    });

    it('rejects adding non-existent variant', async () => {
      const response = await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ variantId: '123e4567-e89b-12d3-a456-426614174000', quantity: 1 });

      expect(response.status).toBe(404);
      const error = errorResponseSchema.parse(response.body);
      expect(error.error.code).toBe(ERROR_CODES.VARIANT_NOT_FOUND);
    });

    it('rejects adding quantity that exceeds available stock', async () => {
      // Variant 2 only has 3 available
      const response = await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ variantId: variant2.id, quantity: 4 });

      expect(response.status).toBe(422);
      const error = errorResponseSchema.parse(response.body);
      expect(error.error.code).toBe(ERROR_CODES.CART_ITEM_QUANTITY_INVALID);
    });
  });

  describe('PATCH /api/v1/cart/items/:itemId (Update quantity)', () => {
    it('updates quantity of an existing item', async () => {
      const addRes = await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ variantId: variant1.id, quantity: 1 });
      const addParsed = cartResponseSchema.parse(addRes.body);
      const itemId = addParsed.data.items[0]?.id;

      const updateRes = await request(app)
        .patch(`/api/v1/cart/items/${itemId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ quantity: 4 });

      expect(updateRes.status).toBe(200);
      const parsed = cartResponseSchema.parse(updateRes.body);
      const [firstItem] = parsed.data.items;
      expect(firstItem?.quantity).toBe(4);
      expect(parsed.data.subtotal).toBe('80000000');
    });

    it('rejects updating quantity above available stock', async () => {
      const addRes = await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ variantId: variant2.id, quantity: 1 });
      const addParsed = cartResponseSchema.parse(addRes.body);
      const itemId = addParsed.data.items[0]?.id;

      // Variant 2 only has 3 available
      const updateRes = await request(app)
        .patch(`/api/v1/cart/items/${itemId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ quantity: 10 });

      expect(updateRes.status).toBe(422);
      const error = errorResponseSchema.parse(updateRes.body);
      expect(error.error.code).toBe(ERROR_CODES.CART_ITEM_QUANTITY_INVALID);
    });

    it('prevents user from modifying another users cart item', async () => {
      const addRes = await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ variantId: variant1.id, quantity: 1 });
      const addParsed = cartResponseSchema.parse(addRes.body);
      const itemId = addParsed.data.items[0]?.id;

      // User 2 attempts to modify User 1's item
      const updateRes = await request(app)
        .patch(`/api/v1/cart/items/${itemId}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ quantity: 2 });

      expect(updateRes.status).toBe(404);
      const error = errorResponseSchema.parse(updateRes.body);
      expect(error.error.code).toBe(ERROR_CODES.CART_ITEM_NOT_FOUND);
    });
  });

  describe('DELETE /api/v1/cart/items/:itemId & DELETE /api/v1/cart', () => {
    it('removes item from cart', async () => {
      const addRes = await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ variantId: variant1.id, quantity: 2 });
      const addParsed = cartResponseSchema.parse(addRes.body);
      const itemId = addParsed.data.items[0]?.id;

      const deleteRes = await request(app)
        .delete(`/api/v1/cart/items/${itemId}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(deleteRes.status).toBe(200);
      const parsed = cartResponseSchema.parse(deleteRes.body);
      expect(parsed.data.items.length).toBe(0);
      expect(parsed.data.subtotal).toBe('0');
    });

    it('clears entire cart', async () => {
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ variantId: variant1.id, quantity: 1 });
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ variantId: variant2.id, quantity: 1 });

      const clearRes = await request(app)
        .delete('/api/v1/cart')
        .set('Authorization', `Bearer ${user1Token}`);

      expect(clearRes.status).toBe(200);
      const parsed = cartResponseSchema.parse(clearRes.body);
      expect(parsed.data.items.length).toBe(0);
      expect(parsed.data.totalItems).toBe(0);
    });
  });

  describe('Live Pricing & Availability Warnings', () => {
    it('flags unavailable items and excludes them from live subtotal', async () => {
      // 1. User adds variant1 (2 items, 20tr each) and variant2 (1 item, 23tr)
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ variantId: variant1.id, quantity: 2 });

      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ variantId: variant2.id, quantity: 1 });

      // Subtotal = 40tr + 23tr = 63tr
      let getRes = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${user1Token}`);
      let getParsed = cartResponseSchema.parse(getRes.body);
      expect(getParsed.data.subtotal).toBe('63000000');
      expect(getParsed.data.hasUnavailableItems).toBe(false);

      // 2. Admin sets variant2 to inactive
      await prisma.productVariant.update({
        where: { id: variant2.id },
        data: { isActive: false },
      });

      // 3. User views cart again
      getRes = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${user1Token}`);

      getParsed = cartResponseSchema.parse(getRes.body);
      expect(getParsed.data.hasUnavailableItems).toBe(true);
      expect(getParsed.data.unavailableItemCount).toBe(1);
      expect(getParsed.data.availableItemCount).toBe(2);
      // Subtotal should only include variant1 (40,000,000)
      expect(getParsed.data.subtotal).toBe('40000000');

      const item2 = getParsed.data.items.find((i) => i.variantId === variant2.id);
      expect(item2?.isAvailable).toBe(false);
      expect(item2?.warningReason).toBe('VARIANT_INACTIVE');
    });
  });
});

