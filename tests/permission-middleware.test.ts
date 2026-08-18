import bcrypt from 'bcrypt';
import express, { type Express } from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PERMISSIONS, ROLES } from '../src/constants/index.js';
import { prisma } from '../src/database/prisma.js';
import { requireAuth } from '../src/middlewares/auth.middleware.js';
import { errorHandler } from '../src/middlewares/error.middleware.js';
import { requirePermission } from '../src/middlewares/permission.middleware.js';
import { jwtService } from '../src/utils/jwt.js';

const successResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

describe('requirePermission Middleware', () => {
  let app: Express;

  beforeEach(async () => {
    app = express();
    app.use(express.json());

    // Endpoint giả lập cần quyền catalog:write
    app.post(
      '/test/catalog',
      requireAuth,
      requirePermission(PERMISSIONS.CATALOG_WRITE),
      (_req, res) => {
        res.status(200).json({ success: true, message: 'Catalog created' });
      },
    );

    app.use(errorHandler);

    // Clean up
    await prisma.userPermission.deleteMany();
    await prisma.user.deleteMany({
      where: {
        email: {
          in: ['admin_perm@test.com', 'staff_perm@test.com', 'cust_perm@test.com'],
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('allows ADMIN to bypass permission check', async () => {
    const admin = await prisma.user.create({
      data: {
        email: 'admin_perm@test.com',
        fullName: 'Admin',
        passwordHash: await bcrypt.hash('pass123', 12),
        role: ROLES.ADMIN,
        isActive: true,
      },
    });
    const token = jwtService.signAccessToken({ userId: admin.id, role: ROLES.ADMIN });

    const response = await request(app)
      .post('/test/catalog')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    const body = successResponseSchema.parse(response.body);
    expect(body.message).toBe('Catalog created');
  });

  it('blocks CUSTOMER with 403 Forbidden', async () => {
    const customer = await prisma.user.create({
      data: {
        email: 'cust_perm@test.com',
        fullName: 'Customer',
        passwordHash: await bcrypt.hash('pass123', 12),
        role: ROLES.CUSTOMER,
        isActive: true,
      },
    });
    const token = jwtService.signAccessToken({ userId: customer.id, role: ROLES.CUSTOMER });

    const response = await request(app)
      .post('/test/catalog')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    const body = errorResponseSchema.parse(response.body);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('allows STAFF with required permission', async () => {
    const staff = await prisma.user.create({
      data: {
        email: 'staff_perm@test.com',
        fullName: 'Staff',
        passwordHash: await bcrypt.hash('pass123', 12),
        role: ROLES.STAFF,
        isActive: true,
        permissions: {
          create: [{ permission: PERMISSIONS.CATALOG_WRITE }],
        },
      },
    });
    const token = jwtService.signAccessToken({ userId: staff.id, role: ROLES.STAFF });

    const response = await request(app)
      .post('/test/catalog')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    const body = successResponseSchema.parse(response.body);
    expect(body.message).toBe('Catalog created');
  });

  it('blocks STAFF without required permission with 403 Insufficient permissions', async () => {
    const staff = await prisma.user.create({
      data: {
        email: 'staff_perm@test.com',
        fullName: 'Staff',
        passwordHash: await bcrypt.hash('pass123', 12),
        role: ROLES.STAFF,
        isActive: true,
        permissions: {
          create: [{ permission: PERMISSIONS.INVENTORY_READ }], // Không có CATALOG_WRITE
        },
      },
    });
    const token = jwtService.signAccessToken({ userId: staff.id, role: ROLES.STAFF });

    const response = await request(app)
      .post('/test/catalog')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    const body = errorResponseSchema.parse(response.body);
    expect(body.error.code).toBe('FORBIDDEN');
    expect(body.error.message).toBe('Insufficient permissions');
  });

  it('blocks deactivated STAFF even if they have the permission', async () => {
    const staff = await prisma.user.create({
      data: {
        email: 'staff_perm@test.com',
        fullName: 'Staff',
        passwordHash: await bcrypt.hash('pass123', 12),
        role: ROLES.STAFF,
        isActive: false, // Bị vô hiệu hóa
        permissions: {
          create: [{ permission: PERMISSIONS.CATALOG_WRITE }],
        },
      },
    });
    const token = jwtService.signAccessToken({ userId: staff.id, role: ROLES.STAFF });

    const response = await request(app)
      .post('/test/catalog')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    const body = errorResponseSchema.parse(response.body);
    expect(body.error.code).toBe('FORBIDDEN');
    expect(body.error.message).toBe('Account is disabled');
  });
});
