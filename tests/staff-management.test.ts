import bcrypt from 'bcrypt';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import { PERMISSIONS, ROLES } from '../src/constants/index.js';
import { prisma } from '../src/database/prisma.js';
import { jwtService } from '../src/utils/jwt.js';

const staffItemSchema = z.object({
  id: z.string(),
  email: z.string(),
  fullName: z.string(),
  role: z.string(),
  isActive: z.boolean(),
  permissions: z.array(z.string()),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

const staffResponseSchema = z.object({
  data: z.object({
    staff: staffItemSchema,
  }),
});

const staffListResponseSchema = z.object({
  data: z.array(staffItemSchema),
  meta: z.object({
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
  requestId: z.string().min(1),
});

const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

describe('Staff Management & Authorization PBAC', () => {
  const app = createApp();

  const adminCredentials = {
    email: 'admin_test@example.com',
    password: 'Password123!',
    fullName: 'Admin Test',
  };

  const customerCredentials = {
    email: 'customer_test@example.com',
    password: 'Password123!',
    fullName: 'Customer Test',
  };

  let adminId: string;
  let customerId: string;
  let adminAccessToken: string;
  let customerAccessToken: string;

  beforeEach(async () => {
    // Dọn dẹp dữ liệu test
    await prisma.auditLog.deleteMany();
    await prisma.userPermission.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany({
      where: {
        OR: [
          { role: ROLES.STAFF },
          {
            email: {
              in: [adminCredentials.email, customerCredentials.email, 'admin2@example.com'],
            },
          },
        ],
      },
    });

    // Tạo Admin user
    const adminPasswordHash = await bcrypt.hash(adminCredentials.password, 12);
    const admin = await prisma.user.create({
      data: {
        email: adminCredentials.email,
        passwordHash: adminPasswordHash,
        fullName: adminCredentials.fullName,
        role: ROLES.ADMIN,
        isActive: true,
      },
    });
    adminId = admin.id;
    adminAccessToken = jwtService.signAccessToken({ userId: admin.id, role: ROLES.ADMIN });

    // Tạo Customer user
    const customerPasswordHash = await bcrypt.hash(customerCredentials.password, 12);
    const customer = await prisma.user.create({
      data: {
        email: customerCredentials.email,
        passwordHash: customerPasswordHash,
        fullName: customerCredentials.fullName,
        role: ROLES.CUSTOMER,
        isActive: true,
      },
    });
    customerId = customer.id;
    customerAccessToken = jwtService.signAccessToken({
      userId: customer.id,
      role: ROLES.CUSTOMER,
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /api/v1/admin/staff', () => {
    it('allows ADMIN to create a new staff with initial permissions and records audit log', async () => {
      const response = await request(app)
        .post('/api/v1/admin/staff')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          email: 'staff1@example.com',
          password: 'StaffPassword123!',
          fullName: 'Staff One',
          permissions: [PERMISSIONS.CATALOG_READ, PERMISSIONS.CATALOG_WRITE],
        });

      expect(response.status).toBe(201);
      const body = staffResponseSchema.parse(response.body);
      expect(body.data.staff).toMatchObject({
        email: 'staff1@example.com',
        fullName: 'Staff One',
        role: ROLES.STAFF,
        isActive: true,
      });
      expect(body.data.staff.permissions).toEqual(
        expect.arrayContaining([PERMISSIONS.CATALOG_READ, PERMISSIONS.CATALOG_WRITE]),
      );

      // Verify audit log
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          targetId: body.data.staff.id,
          action: 'STAFF_CREATED',
        },
      });
      expect(auditLog).not.toBeNull();
      expect(auditLog?.actorId).toBe(adminId);
    });

    it('deduplicates duplicate permissions automatically without throwing 500 error', async () => {
      const response = await request(app)
        .post('/api/v1/admin/staff')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          email: 'staff_dedup@example.com',
          password: 'StaffPassword123!',
          fullName: 'Staff Dedup',
          permissions: [
            PERMISSIONS.CATALOG_READ,
            PERMISSIONS.CATALOG_READ,
            PERMISSIONS.CATALOG_WRITE,
          ],
        });

      expect(response.status).toBe(201);
      const body = staffResponseSchema.parse(response.body);
      expect(body.data.staff.permissions).toHaveLength(2);
      expect(body.data.staff.permissions).toEqual(
        expect.arrayContaining([PERMISSIONS.CATALOG_READ, PERMISSIONS.CATALOG_WRITE]),
      );
    });

    it('rejects CUSTOMER from calling staff creation API with 403 Forbidden', async () => {
      const response = await request(app)
        .post('/api/v1/admin/staff')
        .set('Authorization', `Bearer ${customerAccessToken}`)
        .send({
          email: 'staff2@example.com',
          password: 'StaffPassword123!',
          fullName: 'Staff Two',
          permissions: [PERMISSIONS.INVENTORY_READ],
        });

      expect(response.status).toBe(403);
      const body = errorResponseSchema.parse(response.body);
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('returns 409 Conflict if email is already in use', async () => {
      await request(app)
        .post('/api/v1/admin/staff')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          email: 'staff1@example.com',
          password: 'StaffPassword123!',
          fullName: 'Staff One',
          permissions: [],
        });

      const response = await request(app)
        .post('/api/v1/admin/staff')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          email: 'staff1@example.com',
          password: 'StaffPassword123!',
          fullName: 'Duplicate Staff',
          permissions: [],
        });

      expect(response.status).toBe(409);
      const body = errorResponseSchema.parse(response.body);
      expect(body.error.code).toBe('EMAIL_ALREADY_EXISTS');
    });
  });

  describe('GET /api/v1/admin/staff', () => {
    it('returns paginated staff list with their permissions', async () => {
      await request(app)
        .post('/api/v1/admin/staff')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          email: 'staff1@example.com',
          password: 'StaffPassword123!',
          fullName: 'Staff One',
          permissions: [PERMISSIONS.INVENTORY_READ],
        });

      const response = await request(app)
        .get('/api/v1/admin/staff?page=1&pageSize=10')
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(response.status).toBe(200);
      const body = staffListResponseSchema.parse(response.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]?.email).toBe('staff1@example.com');
      expect(body.data[0]?.permissions).toEqual([PERMISSIONS.INVENTORY_READ]);
      expect(body.meta).toEqual({ page: 1, pageSize: 10, total: 1, totalPages: 1 });
    });
  });

  describe('PATCH /api/v1/admin/staff/:id & Token Revocation', () => {
    it('revokes refresh tokens when staff account is deactivated', async () => {
      // 1. Tạo staff
      const createRes = await request(app)
        .post('/api/v1/admin/staff')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          email: 'staff1@example.com',
          password: 'StaffPassword123!',
          fullName: 'Staff One',
          permissions: [PERMISSIONS.ORDER_READ],
        });
      const createBody = staffResponseSchema.parse(createRes.body);
      const staffId = createBody.data.staff.id;

      // 2. Staff đăng nhập tạo refresh token
      await request(app).post('/api/v1/auth/login').send({
        email: 'staff1@example.com',
        password: 'StaffPassword123!',
      });

      const activeTokenCountBefore = await prisma.refreshToken.count({
        where: { userId: staffId, isRevoked: false },
      });
      expect(activeTokenCountBefore).toBe(1);

      // 3. Admin vô hiệu hóa staff
      const patchRes = await request(app)
        .patch(`/api/v1/admin/staff/${staffId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ isActive: false });

      expect(patchRes.status).toBe(200);
      const patchBody = staffResponseSchema.parse(patchRes.body);
      expect(patchBody.data.staff.isActive).toBe(false);

      // 4. Kiểm tra refresh token đã bị thu hồi
      const activeTokenCountAfter = await prisma.refreshToken.count({
        where: { userId: staffId, isRevoked: false },
      });
      expect(activeTokenCountAfter).toBe(0);

      // 5. Kiểm tra audit log
      const auditLog = await prisma.auditLog.findFirst({
        where: { targetId: staffId, action: 'STAFF_STATUS_UPDATED' },
      });
      expect(auditLog).not.toBeNull();
    });

    it('rejects managing CUSTOMER account via staff endpoint', async () => {
      const response = await request(app)
        .patch(`/api/v1/admin/staff/${customerId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ isActive: false });

      expect(response.status).toBe(400);
      const body = errorResponseSchema.parse(response.body);
      expect(body.error.code).toBe('INVALID_TARGET_ROLE');
    });

    it('prevents deactivating the last active admin', async () => {
      const response = await request(app)
        .patch(`/api/v1/admin/staff/${adminId}`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ isActive: false });

      expect(response.status).toBe(400);
      const body = errorResponseSchema.parse(response.body);
      expect(body.error.code).toBe('CANNOT_DEACTIVATE_LAST_ADMIN');
    });

    it('handles concurrent deactivation requests and ensures at least one admin remains active', async () => {
      // Tạo thêm Admin 2
      const admin2PasswordHash = await bcrypt.hash('Password123!', 12);
      const admin2 = await prisma.user.create({
        data: {
          email: 'admin2@example.com',
          passwordHash: admin2PasswordHash,
          fullName: 'Admin Two',
          role: ROLES.ADMIN,
          isActive: true,
        },
      });

      // Bắn 2 request đồng thời vô hiệu hóa Admin 1 và Admin 2
      const [res1, res2] = await Promise.all([
        request(app)
          .patch(`/api/v1/admin/staff/${adminId}`)
          .set('Authorization', `Bearer ${adminAccessToken}`)
          .send({ isActive: false }),
        request(app)
          .patch(`/api/v1/admin/staff/${admin2.id}`)
          .set('Authorization', `Bearer ${adminAccessToken}`)
          .send({ isActive: false }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      // Đúng 1 request thành công 200 và 1 request thất bại 400
      expect(statuses).toEqual([200, 400]);

      const activeAdminsCount = await prisma.user.count({
        where: { role: ROLES.ADMIN, isActive: true },
      });
      expect(activeAdminsCount).toBe(1);
    });

    it('blocks deactivated ADMIN from accessing admin endpoints', async () => {
      // Vô hiệu hóa admin trong DB
      await prisma.user.update({
        where: { id: adminId },
        data: { isActive: false },
      });

      const response = await request(app)
        .get('/api/v1/admin/staff')
        .set('Authorization', `Bearer ${adminAccessToken}`);

      expect(response.status).toBe(403);
      const body = errorResponseSchema.parse(response.body);
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.message).toBe('Account is disabled');
    });
  });

  describe('PUT /api/v1/admin/staff/:id/permissions', () => {
    it('updates staff permissions, revokes existing refresh tokens and records audit log', async () => {
      // 1. Tạo staff với catalog:read
      const createRes = await request(app)
        .post('/api/v1/admin/staff')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          email: 'staff1@example.com',
          password: 'StaffPassword123!',
          fullName: 'Staff One',
          permissions: [PERMISSIONS.CATALOG_READ],
        });
      const createBody = staffResponseSchema.parse(createRes.body);
      const staffId = createBody.data.staff.id;

      // 2. Staff đăng nhập tạo refresh token
      await request(app).post('/api/v1/auth/login').send({
        email: 'staff1@example.com',
        password: 'StaffPassword123!',
      });

      // 3. Admin đổi permissions sang catalog:write và inventory:read
      const updateRes = await request(app)
        .put(`/api/v1/admin/staff/${staffId}/permissions`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          permissions: [PERMISSIONS.CATALOG_WRITE, PERMISSIONS.INVENTORY_READ],
        });

      expect(updateRes.status).toBe(200);
      const updateBody = staffResponseSchema.parse(updateRes.body);
      expect(updateBody.data.staff.permissions).toEqual(
        expect.arrayContaining([PERMISSIONS.CATALOG_WRITE, PERMISSIONS.INVENTORY_READ]),
      );
      expect(updateBody.data.staff.permissions).not.toContain(PERMISSIONS.CATALOG_READ);

      // 4. Refresh token bị revoke
      const activeTokenCount = await prisma.refreshToken.count({
        where: { userId: staffId, isRevoked: false },
      });
      expect(activeTokenCount).toBe(0);

      // 5. Audit log
      const auditLog = await prisma.auditLog.findFirst({
        where: { targetId: staffId, action: 'STAFF_PERMISSIONS_UPDATED' },
      });
      expect(auditLog).not.toBeNull();
    });

    it('rejects assigning permissions to a non-staff user', async () => {
      const response = await request(app)
        .put(`/api/v1/admin/staff/${adminId}/permissions`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({
          permissions: [PERMISSIONS.CATALOG_WRITE],
        });

      expect(response.status).toBe(400);
      const body = errorResponseSchema.parse(response.body);
      expect(body.error.code).toBe('INVALID_TARGET_ROLE');
    });
  });
});
