import bcrypt from 'bcrypt';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import { AUDIT_ACTIONS, ERROR_CODES, PERMISSIONS, ROLES, STOCK_MOVEMENT_TYPES } from '../src/constants/index.js';
import { prisma } from '../src/database/prisma.js';
import { inventoryService } from '../src/modules/inventory/inventory.service.js';
import { jwtService } from '../src/utils/jwt.js';

// ==================== Response Schemas for Testing ====================

const inventoryItemSchema = z.object({
  id: z.string(),
  variantId: z.string(),
  onHand: z.number(),
  reserved: z.number(),
  available: z.number(),
  variant: z.object({
    id: z.string(),
    sku: z.string(),
    name: z.string(),
    price: z.string(),
  }),
});

const inventoryListResponseSchema = z.object({
  data: z.array(inventoryItemSchema),
  meta: z.object({
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

const inventoryDetailResponseSchema = z.object({
  data: z.object({
    inventory: inventoryItemSchema,
  }),
});

const stockMovementItemSchema = z.object({
  id: z.string(),
  inventoryId: z.string(),
  type: z.string(),
  onHandChange: z.number(),
  reservedChange: z.number(),
  balanceAfterOnHand: z.number(),
  balanceAfterReserved: z.number(),
  reason: z.string().nullable().optional(),
});

const stockMovementsListResponseSchema = z.object({
  data: z.array(stockMovementItemSchema),
  meta: z.object({
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

// ==================== Tests ====================

describe('Inventory & Stock Movement Domain', () => {
  const app = createApp();

  let adminToken: string;
  let staffTokenWithWrite: string;
  let staffTokenWithReadOnly: string;
  let staffTokenWithoutInventory: string;
  let customerToken: string;
  let staffWithWriteId: string;

  let testCategory: { id: string; name: string; slug: string };
  let testProduct: { id: string; name: string; slug: string };
  let testVariant: { id: string; sku: string; name: string; price: bigint };

  beforeEach(async () => {
    // Dọn dẹp dữ liệu
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
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();

    const passwordHash = await bcrypt.hash('Password123!', 10);

    // 1. Tạo ADMIN
    const admin = await prisma.user.create({
      data: {
        email: 'admin@inventory-test.com',
        passwordHash,
        fullName: 'Admin User',
        role: ROLES.ADMIN,
        isActive: true,
      },
    });
    adminToken = jwtService.signAccessToken({ userId: admin.id, role: admin.role });

    // 2. Tạo STAFF với quyền inventory:write và inventory:read
    const staffWrite = await prisma.user.create({
      data: {
        email: 'staff-write@inventory-test.com',
        passwordHash,
        fullName: 'Staff Inventory Manager',
        role: ROLES.STAFF,
        isActive: true,
      },
    });
    staffWithWriteId = staffWrite.id;
    await prisma.userPermission.createMany({
      data: [
        { userId: staffWrite.id, permission: PERMISSIONS.INVENTORY_READ },
        { userId: staffWrite.id, permission: PERMISSIONS.INVENTORY_WRITE },
      ],
    });
    staffTokenWithWrite = jwtService.signAccessToken({
      userId: staffWrite.id,
      role: staffWrite.role,
    });

    // 3. Tạo STAFF chỉ có quyền inventory:read
    const staffReadOnly = await prisma.user.create({
      data: {
        email: 'staff-readonly@inventory-test.com',
        passwordHash,
        fullName: 'Staff Readonly',
        role: ROLES.STAFF,
        isActive: true,
      },
    });
    await prisma.userPermission.create({
      data: { userId: staffReadOnly.id, permission: PERMISSIONS.INVENTORY_READ },
    });
    staffTokenWithReadOnly = jwtService.signAccessToken({
      userId: staffReadOnly.id,
      role: staffReadOnly.role,
    });

    // 4. Tạo STAFF không có quyền inventory
    const staffNoPerm = await prisma.user.create({
      data: {
        email: 'staff-noperm@inventory-test.com',
        passwordHash,
        fullName: 'Staff No Perm',
        role: ROLES.STAFF,
        isActive: true,
      },
    });
    staffTokenWithoutInventory = jwtService.signAccessToken({
      userId: staffNoPerm.id,
      role: staffNoPerm.role,
    });

    // 5. Tạo CUSTOMER
    const customer = await prisma.user.create({
      data: {
        email: 'customer@inventory-test.com',
        passwordHash,
        fullName: 'Customer User',
        role: ROLES.CUSTOMER,
        isActive: true,
      },
    });
    customerToken = jwtService.signAccessToken({
      userId: customer.id,
      role: customer.role,
    });

    // 6. Tạo Category, Product và Variant mẫu
    testCategory = await prisma.category.create({
      data: {
        name: 'Laptops',
        slug: 'laptops',
      },
    });

    testProduct = await prisma.product.create({
      data: {
        name: 'MacBook Pro 16 M3 Max',
        slug: 'macbook-pro-16-m3-max',
        categoryId: testCategory.id,
        status: 'ACTIVE',
      },
    });

    testVariant = await prisma.productVariant.create({
      data: {
        productId: testProduct.id,
        sku: 'MBP16-M3-36-1TB',
        name: 'MacBook Pro 16 36GB 1TB Space Black',
        price: 79990000n,
        isActive: true,
        inventory: { create: {} },
      },
    });
  });

  afterAll(async () => {
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
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
  });

  // ==================== Authorization Tests ====================

  describe('Authorization & Permissions', () => {
    it('rejects unauthenticated requests with 401 UNAUTHORIZED', async () => {
      const res = await request(app).get('/api/v1/admin/inventory');
      expect(res.status).toBe(401);
      const parsed = errorResponseSchema.parse(res.body);
      expect(parsed.error.code).toBe(ERROR_CODES.UNAUTHORIZED);
    });

    it('rejects CUSTOMER user from calling admin inventory APIs with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/v1/admin/inventory')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
      const parsed = errorResponseSchema.parse(res.body);
      expect(parsed.error.code).toBe(ERROR_CODES.FORBIDDEN);
    });

    it('rejects STAFF without inventory:read permission with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/v1/admin/inventory')
        .set('Authorization', `Bearer ${staffTokenWithoutInventory}`);
      expect(res.status).toBe(403);
      const parsed = errorResponseSchema.parse(res.body);
      expect(parsed.error.code).toBe(ERROR_CODES.FORBIDDEN);
    });

    it('allows STAFF with inventory:read to view inventory list and details, but blocks restock mutation', async () => {
      // 1. Xem danh sách tồn kho
      const listRes = await request(app)
        .get('/api/v1/admin/inventory')
        .set('Authorization', `Bearer ${staffTokenWithReadOnly}`);
      expect(listRes.status).toBe(200);
      const listParsed = inventoryListResponseSchema.parse(listRes.body);
      expect(listParsed.data.length).toBeGreaterThanOrEqual(0);

      // 2. Xem chi tiết tồn kho
      const detailRes = await request(app)
        .get(`/api/v1/admin/inventory/${testVariant.id}`)
        .set('Authorization', `Bearer ${staffTokenWithReadOnly}`);
      expect(detailRes.status).toBe(200);

      // 3. Thử gọi API nhập kho -> Bị chặn 403
      const restockRes = await request(app)
        .post(`/api/v1/admin/inventory/${testVariant.id}/restock`)
        .set('Authorization', `Bearer ${staffTokenWithReadOnly}`)
        .send({ quantity: 20 });
      expect(restockRes.status).toBe(403);
      const parsed = errorResponseSchema.parse(restockRes.body);
      expect(parsed.error.code).toBe(ERROR_CODES.FORBIDDEN);
    });
  });

  // ==================== Business Logic & Stock Management ====================

  describe('Inventory Restock & Adjustment Operations', () => {
    it('allows STAFF with inventory:write to restock inventory and creates StockMovement + AuditLog atomically', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/inventory/${testVariant.id}/restock`)
        .set('Authorization', `Bearer ${staffTokenWithWrite}`)
        .send({
          quantity: 50,
          reason: 'Initial shipment from Apple Vietnam',
        });

      expect(res.status).toBe(200);
      const parsed = inventoryDetailResponseSchema.parse(res.body);
      expect(parsed.data.inventory.variantId).toBe(testVariant.id);
      expect(parsed.data.inventory.onHand).toBe(50);
      expect(parsed.data.inventory.reserved).toBe(0);
      expect(parsed.data.inventory.available).toBe(50);

      // Verify StockMovement record in database
      const movements = await prisma.stockMovement.findMany({
        where: { inventoryId: parsed.data.inventory.id },
      });
      expect(movements.length).toBe(1);
      expect(movements[0]?.type).toBe(STOCK_MOVEMENT_TYPES.RESTOCK);
      expect(movements[0]?.onHandChange).toBe(50);
      expect(movements[0]?.reservedChange).toBe(0);
      expect(movements[0]?.balanceAfterOnHand).toBe(50);
      expect(movements[0]?.balanceAfterReserved).toBe(0);
      expect(movements[0]?.actorId).toBe(staffWithWriteId);

      // Verify AuditLog record in database
      const auditLogs = await prisma.auditLog.findMany({
        where: { targetId: parsed.data.inventory.id },
      });
      expect(auditLogs.length).toBe(1);
      expect(auditLogs[0]?.action).toBe(AUDIT_ACTIONS.INVENTORY_RESTOCKED);
      expect(auditLogs[0]?.actorId).toBe(staffWithWriteId);
    });

    it('allows ADMIN to adjust physical stock with reason', async () => {
      // 1. Restock 50 trước
      await request(app)
        .post(`/api/v1/admin/inventory/${testVariant.id}/restock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ quantity: 50, reason: 'Initial inventory' });

      // 2. Adjust xuống 45 do kiểm kê định kỳ
      const adjustRes = await request(app)
        .post(`/api/v1/admin/inventory/${testVariant.id}/adjust`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          newOnHand: 45,
          reason: 'Physical count discrepancy: 5 units damaged in transport',
        });

      expect(adjustRes.status).toBe(200);
      const parsed = inventoryDetailResponseSchema.parse(adjustRes.body);
      expect(parsed.data.inventory.onHand).toBe(45);
      expect(parsed.data.inventory.available).toBe(45);

      // 3. Kiểm tra lịch sử stock movements có 2 bản ghi (RESTOCK và ADJUSTMENT)
      const movementsRes = await request(app)
        .get(`/api/v1/admin/inventory/${testVariant.id}/movements`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(movementsRes.status).toBe(200);
      const movementsParsed = stockMovementsListResponseSchema.parse(movementsRes.body);
      expect(movementsParsed.data.length).toBe(2);
      expect(movementsParsed.data[0]?.type).toBe(STOCK_MOVEMENT_TYPES.ADJUSTMENT);
      expect(movementsParsed.data[0]?.onHandChange).toBe(-5);
      expect(movementsParsed.data[0]?.balanceAfterOnHand).toBe(45);
    });

    it('rejects adjusting on-hand stock below the reserved quantity with 422 INVALID_STOCK_ADJUSTMENT', async () => {
      // 1. Nhập 10 items
      await request(app)
        .post(`/api/v1/admin/inventory/${testVariant.id}/restock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ quantity: 10, reason: 'Initial inventory' });

      // 2. Tạm giữ 6 items trong transaction giả lập order
      await prisma.$transaction(async (tx) => {
        await inventoryService.reserveStock(testVariant.id, 6, 'ORDER-TEST-001', null, tx);
      });

      // 3. Thử điều chỉnh newOnHand = 4 (nhỏ hơn reserved = 6) -> Phải bị từ chối
      const adjustRes = await request(app)
        .post(`/api/v1/admin/inventory/${testVariant.id}/adjust`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          newOnHand: 4,
          reason: 'Trying to adjust below reserved',
        });

      expect(adjustRes.status).toBe(422);
      const parsed = errorResponseSchema.parse(adjustRes.body);
      expect(parsed.error.code).toBe(ERROR_CODES.INVALID_STOCK_ADJUSTMENT);
    });

    it('validates request payload and rejects negative/invalid quantities', async () => {
      // 1. Restock with quantity = 0
      const zeroRes = await request(app)
        .post(`/api/v1/admin/inventory/${testVariant.id}/restock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ quantity: 0, reason: 'Invalid restock' });
      expect(zeroRes.status).toBe(422);

      // 2. Adjust without reason
      const noReasonRes = await request(app)
        .post(`/api/v1/admin/inventory/${testVariant.id}/adjust`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ newOnHand: 10 });
      expect(noReasonRes.status).toBe(422);

      const restockWithoutReasonRes = await request(app)
        .post(`/api/v1/admin/inventory/${testVariant.id}/restock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ quantity: 10 });
      expect(restockWithoutReasonRes.status).toBe(422);

      // 3. Non-existent variantId
      const nonExistentRes = await request(app)
        .post('/api/v1/admin/inventory/00000000-0000-0000-0000-000000000000/restock')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ quantity: 10, reason: 'Initial inventory' });
      expect(nonExistentRes.status).toBe(404);
      const errParsed = errorResponseSchema.parse(nonExistentRes.body);
      expect(errParsed.error.code).toBe(ERROR_CODES.VARIANT_NOT_FOUND);
    });

    it('creates inventory with a new variant and keeps inventory GET free of writes', async () => {
      const createResponse = await request(app)
        .post(`/api/v1/admin/products/${testProduct.id}/variants`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sku: 'MBP16-M3-48-1TB',
          name: 'MacBook Pro 16 48GB 1TB Space Black',
          price: '89990000',
        });

      expect(createResponse.status).toBe(201);
      const createdVariantId = z
        .object({ data: z.object({ variant: z.object({ id: z.string().uuid() }) }) })
        .parse(createResponse.body).data.variant.id;
      expect(await prisma.inventory.count({ where: { variantId: createdVariantId } })).toBe(1);

      const orphanVariant = await prisma.productVariant.create({
        data: {
          productId: testProduct.id,
          sku: 'MBP16-M3-ORPHAN',
          name: 'Orphan inventory test variant',
          price: 1n,
        },
      });

      const detailResponse = await request(app)
        .get(`/api/v1/admin/inventory/${orphanVariant.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(detailResponse.status).toBe(404);
      expect(await prisma.inventory.count({ where: { variantId: orphanVariant.id } })).toBe(0);
    });
  });

  // ==================== Domain Reservation Flow & Concurrency ====================

  describe('Domain Reservation Methods & Concurrency Protection', () => {
    it('executes reserve, commit and release stock lifecycle correctly', async () => {
      // 1. Restock 20 items
      await inventoryService.restock(
        testVariant.id,
        { quantity: 20, reason: 'Initial inventory' },
        staffWithWriteId,
      );

      // 2. Reserve 5 items for Order #1
      await prisma.$transaction(async (tx) => {
        await inventoryService.reserveStock(testVariant.id, 5, 'ORDER-101', null, tx);
      });

      let inv = await inventoryService.getInventoryByVariantId(testVariant.id);
      expect(inv.onHand).toBe(20);
      expect(inv.reserved).toBe(5);
      expect(inv.available).toBe(15);

      // 3. Commit 5 items for Order #1 (thanh toán thành công)
      await prisma.$transaction(async (tx) => {
        await inventoryService.commitReservation(testVariant.id, 5, 'ORDER-101', null, tx);
      });

      inv = await inventoryService.getInventoryByVariantId(testVariant.id);
      expect(inv.onHand).toBe(15);
      expect(inv.reserved).toBe(0);
      expect(inv.available).toBe(15);

      // 4. Reserve 3 items for Order #2
      await prisma.$transaction(async (tx) => {
        await inventoryService.reserveStock(testVariant.id, 3, 'ORDER-102', null, tx);
      });

      inv = await inventoryService.getInventoryByVariantId(testVariant.id);
      expect(inv.onHand).toBe(15);
      expect(inv.reserved).toBe(3);
      expect(inv.available).toBe(12);

      // 5. Release 3 items for Order #2 (đơn hàng bị huỷ)
      await prisma.$transaction(async (tx) => {
        await inventoryService.releaseReservation(testVariant.id, 3, 'ORDER-102', null, tx);
      });

      inv = await inventoryService.getInventoryByVariantId(testVariant.id);
      expect(inv.onHand).toBe(15);
      expect(inv.reserved).toBe(0);
      expect(inv.available).toBe(15);
    });

    it('treats repeated reserve and commit events as idempotent retries', async () => {
      await inventoryService.restock(
        testVariant.id,
        { quantity: 10, reason: 'Initial inventory' },
        staffWithWriteId,
      );

      for (let attempt = 0; attempt < 2; attempt += 1) {
        await prisma.$transaction(async (tx) => {
          await inventoryService.reserveStock(testVariant.id, 4, 'ORDER-IDEMPOTENT', null, tx);
        });
      }

      for (let attempt = 0; attempt < 2; attempt += 1) {
        await prisma.$transaction(async (tx) => {
          await inventoryService.commitReservation(testVariant.id, 4, 'ORDER-IDEMPOTENT', null, tx);
        });
      }

      const inventory = await inventoryService.getInventoryByVariantId(testVariant.id);
      expect(inventory.onHand).toBe(6);
      expect(inventory.reserved).toBe(0);

      const eventCount = await prisma.stockMovement.count({
        where: {
          inventoryId: inventory.id,
          referenceType: 'ORDER',
          referenceId: 'ORDER-IDEMPOTENT',
        },
      });
      expect(eventCount).toBe(2);
    });

    it('rejects conflicting retries and terminal events without a matching reservation', async () => {
      await inventoryService.restock(
        testVariant.id,
        { quantity: 10, reason: 'Initial inventory' },
        staffWithWriteId,
      );

      await prisma.$transaction(async (tx) => {
        await inventoryService.reserveStock(testVariant.id, 4, 'ORDER-OWNER', null, tx);
      });

      await expect(
        prisma.$transaction(async (tx) => {
          await inventoryService.reserveStock(testVariant.id, 5, 'ORDER-OWNER', null, tx);
        }),
      ).rejects.toMatchObject({ code: ERROR_CODES.STOCK_EVENT_CONFLICT });

      await expect(
        prisma.$transaction(async (tx) => {
          await inventoryService.commitReservation(testVariant.id, 4, 'ORDER-OTHER', null, tx);
        }),
      ).rejects.toMatchObject({ code: ERROR_CODES.INVALID_STOCK_OPERATION });

      await expect(
        prisma.$transaction(async (tx) => {
          await inventoryService.releaseReservation(testVariant.id, 5, 'ORDER-OWNER', null, tx);
        }),
      ).rejects.toMatchObject({ code: ERROR_CODES.INVALID_STOCK_OPERATION });

      const inventory = await inventoryService.getInventoryByVariantId(testVariant.id);
      expect(inventory.onHand).toBe(10);
      expect(inventory.reserved).toBe(4);
    });

    it('preserves stock history by rejecting deletion of a variant with movements', async () => {
      await inventoryService.restock(
        testVariant.id,
        { quantity: 2, reason: 'Initial inventory' },
        staffWithWriteId,
      );

      const response = await request(app)
        .delete(`/api/v1/admin/variants/${testVariant.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(409);
      const error = errorResponseSchema.parse(response.body);
      expect(error.error.code).toBe(ERROR_CODES.STOCK_HISTORY_EXISTS);
      expect(await prisma.stockMovement.count()).toBe(1);
      expect(await prisma.productVariant.count({ where: { id: testVariant.id } })).toBe(1);
    });

    it('rejects reservation when requested quantity exceeds available stock', async () => {
      // 1. Restock 5 items
      await inventoryService.restock(
        testVariant.id,
        { quantity: 5, reason: 'Initial inventory' },
        staffWithWriteId,
      );

      // 2. Yêu cầu reserve 10 items (chỉ có 5 khả dụng) -> Phải throw INSUFFICIENT_STOCK
      await expect(
        prisma.$transaction(async (tx) => {
          await inventoryService.reserveStock(testVariant.id, 10, 'ORDER-OVERFLOW', null, tx);
        }),
      ).rejects.toThrow();

      // Đảm bảo dữ liệu không bị thay đổi
      const inv = await inventoryService.getInventoryByVariantId(testVariant.id);
      expect(inv.onHand).toBe(5);
      expect(inv.reserved).toBe(0);
      expect(inv.available).toBe(5);
    });

    it('guarantees concurrency safety: 10 concurrent requests cannot oversell limited stock', async () => {
      // 1. Restock chính xác 10 items
      await inventoryService.restock(
        testVariant.id,
        { quantity: 10, reason: 'Initial inventory' },
        staffWithWriteId,
      );

      // 2. Tạo 10 request đồng thời, mỗi request muốn reserve 2 items (Tổng cầu = 20 items, chỉ có 10 items)
      const concurrentRequests = Array.from({ length: 10 }, (_, index) => {
        return prisma
          .$transaction(async (tx) => {
            await inventoryService.reserveStock(
              testVariant.id,
              2,
              `ORDER-RACE-${index + 1}`,
              null,
              tx,
            );
            return { success: true, orderId: `ORDER-RACE-${index + 1}` };
          })
          .catch((err: unknown) => {
            const e = err as { code?: string; message?: string };
            return { success: false, error: e.code ?? e.message };
          });
      });

      const results = await Promise.all(concurrentRequests);

      const successes = results.filter((r) => r.success);
      const failures = results.filter((r) => !r.success);

      // Phải có đúng 5 request thành công (5 * 2 = 10 items) và 5 request bị từ chối
      expect(successes.length).toBe(5);
      expect(failures.length).toBe(5);

      // 3. Kiểm tra trạng thái cuối cùng trong database
      const finalInv = await inventoryService.getInventoryByVariantId(testVariant.id);
      expect(finalInv.onHand).toBe(10);
      expect(finalInv.reserved).toBe(10);
      expect(finalInv.available).toBe(0);

      // Tồn kho không bao giờ bị âm
      expect(finalInv.onHand).toBeGreaterThanOrEqual(finalInv.reserved);
    });
  });
});
