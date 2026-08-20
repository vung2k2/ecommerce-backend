import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import { prisma } from '../src/database/prisma.js';

const tokenResponseSchema = z.object({
  data: z.object({
    accessToken: z.string().min(1),
  }),
});

const userProfileResponseSchema = z.object({
  data: z.object({
    user: z.object({
      id: z.string(),
      email: z.string(),
      fullName: z.string(),
      role: z.string(),
      isActive: z.boolean(),
      createdAt: z.string(),
      updatedAt: z.string(),
    }),
  }),
});

const addressItemSchema = z.object({
  id: z.string(),
  recipientName: z.string(),
  phone: z.string(),
  province: z.string(),
  district: z.string(),
  ward: z.string(),
  streetAddress: z.string(),
  isDefault: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const addressResponseSchema = z.object({
  data: z.object({
    address: addressItemSchema,
  }),
});

const addressListResponseSchema = z.object({
  data: z.object({
    addresses: z.array(addressItemSchema),
  }),
});

const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

const successMessageResponseSchema = z.object({
  data: z.object({
    message: z.string(),
  }),
});

describe('Users & Address Management', () => {
  const app = createApp();

  const userA = {
    email: 'user_a@example.com',
    password: 'password123',
    fullName: 'User Alpha',
  };

  const userB = {
    email: 'user_b@example.com',
    password: 'password123',
    fullName: 'User Beta',
  };

  let tokenA: string;
  let tokenB: string;

  beforeEach(async () => {
    await prisma.user.deleteMany({
      where: {
        email: { in: [userA.email, userB.email] },
      },
    });

    const resA = await request(app).post('/api/v1/auth/register').send(userA);
    const resB = await request(app).post('/api/v1/auth/register').send(userB);

    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);

    const loginA = await request(app).post('/api/v1/auth/login').send({
      email: userA.email,
      password: userA.password,
    });
    const loginB = await request(app).post('/api/v1/auth/login').send({
      email: userB.email,
      password: userB.password,
    });

    tokenA = tokenResponseSchema.parse(loginA.body as unknown).data.accessToken;
    tokenB = tokenResponseSchema.parse(loginB.body as unknown).data.accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('GET /api/v1/users/me', () => {
    it('returns 401 when unauthorized', async () => {
      const res = await request(app).get('/api/v1/users/me');
      expect(res.status).toBe(401);
    });

    it('returns current user profile and hides password hash', async () => {
      const res = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      const parsed = userProfileResponseSchema.parse(res.body as unknown);
      expect(parsed.data.user).toMatchObject({
        email: userA.email,
        fullName: userA.fullName,
        role: 'CUSTOMER',
      });
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });
  });

  describe('PATCH /api/v1/users/me', () => {
    it('rejects empty payload with 422', async () => {
      const res = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({});

      expect(res.status).toBe(422);
      const parsed = errorResponseSchema.parse(res.body as unknown);
      expect(parsed.error.code).toBe('VALIDATION_ERROR');
    });

    it('updates full name successfully', async () => {
      const res = await request(app)
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ fullName: 'Updated Alpha Name' });

      expect(res.status).toBe(200);
      const parsedUpdate = userProfileResponseSchema.parse(res.body as unknown);
      expect(parsedUpdate.data.user.fullName).toBe('Updated Alpha Name');

      const profile = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${tokenA}`);
      const parsedGet = userProfileResponseSchema.parse(profile.body as unknown);
      expect(parsedGet.data.user.fullName).toBe('Updated Alpha Name');
    });
  });

  describe('Address Management Flow', () => {
    const address1 = {
      recipientName: 'Alpha Home',
      phone: '0912345678',
      province: 'Hà Nội',
      district: 'Cầu Giấy',
      ward: 'Dịch Vọng',
      streetAddress: '123 Đường Cầu Giấy',
    };

    const address2 = {
      recipientName: 'Alpha Office',
      phone: '0987654321',
      province: 'Hà Nội',
      district: 'Ba Đình',
      ward: 'Kim Mã',
      streetAddress: '456 Đường Kim Mã',
      isDefault: false,
    };

    it('auto sets isDefault=true for the very first address', async () => {
      const res = await request(app)
        .post('/api/v1/users/me/addresses')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ ...address1, isDefault: false });

      expect(res.status).toBe(201);
      const parsed = addressResponseSchema.parse(res.body as unknown);
      expect(parsed.data.address.isDefault).toBe(true);
      expect(parsed.data.address.recipientName).toBe('Alpha Home');
    });

    it('manages multiple addresses and ensures only one default address', async () => {
      // 1. Tạo địa chỉ 1 -> Tự động thành default
      const res1 = await request(app)
        .post('/api/v1/users/me/addresses')
        .set('Authorization', `Bearer ${tokenA}`)
        .send(address1);
      expect(res1.status).toBe(201);
      const addr1 = addressResponseSchema.parse(res1.body as unknown).data.address;
      expect(addr1.isDefault).toBe(true);

      // 2. Tạo địa chỉ 2 (isDefault: false) -> Địa chỉ 1 vẫn là default
      const res2 = await request(app)
        .post('/api/v1/users/me/addresses')
        .set('Authorization', `Bearer ${tokenA}`)
        .send(address2);
      expect(res2.status).toBe(201);
      const addr2 = addressResponseSchema.parse(res2.body as unknown).data.address;
      expect(addr2.isDefault).toBe(false);

      // 3. Đặt địa chỉ 2 làm mặc định qua API setDefault
      const setDefaultRes = await request(app)
        .patch(`/api/v1/users/me/addresses/${addr2.id}/default`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(setDefaultRes.status).toBe(200);
      const defaultUpdated = addressResponseSchema.parse(setDefaultRes.body as unknown).data
        .address;
      expect(defaultUpdated.isDefault).toBe(true);

      // 4. Lấy danh sách địa chỉ -> addr2 là default, addr1 không còn là default
      const listRes = await request(app)
        .get('/api/v1/users/me/addresses')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(listRes.status).toBe(200);
      const list = addressListResponseSchema.parse(listRes.body as unknown).data.addresses;
      expect(list.length).toBe(2);
      expect(list[0]?.id).toBe(addr2.id);
      expect(list[0]?.isDefault).toBe(true);
      expect(list[1]?.id).toBe(addr1.id);
      expect(list[1]?.isDefault).toBe(false);

      // 5. Cập nhật địa chỉ 1 thành isDefault: true qua PATCH
      const updateRes = await request(app)
        .patch(`/api/v1/users/me/addresses/${addr1.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ isDefault: true, recipientName: 'Alpha New Home' });
      expect(updateRes.status).toBe(200);
      const updated = addressResponseSchema.parse(updateRes.body as unknown).data.address;
      expect(updated.isDefault).toBe(true);
      expect(updated.recipientName).toBe('Alpha New Home');

      const checkListRes = await request(app)
        .get('/api/v1/users/me/addresses')
        .set('Authorization', `Bearer ${tokenA}`);
      const updatedList = addressListResponseSchema.parse(checkListRes.body as unknown).data
        .addresses;
      expect(updatedList.find((a) => a.id === addr1.id)?.isDefault).toBe(true);
      expect(updatedList.find((a) => a.id === addr2.id)?.isDefault).toBe(false);
    });

    it('enforces strict ownership isolation between users', async () => {
      // User A tạo 1 địa chỉ
      const resA = await request(app)
        .post('/api/v1/users/me/addresses')
        .set('Authorization', `Bearer ${tokenA}`)
        .send(address1);
      expect(resA.status).toBe(201);
      const addressA = addressResponseSchema.parse(resA.body as unknown).data.address;

      // User B cố gắng cập nhật địa chỉ của User A -> 404 NOT_FOUND
      const updateRes = await request(app)
        .patch(`/api/v1/users/me/addresses/${addressA.id}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ recipientName: 'Hacker Name' });
      expect(updateRes.status).toBe(404);
      expect(errorResponseSchema.parse(updateRes.body as unknown).error.code).toBe(
        'ADDRESS_NOT_FOUND',
      );

      // User B cố gắng xóa địa chỉ của User A -> 404 NOT_FOUND
      const deleteRes = await request(app)
        .delete(`/api/v1/users/me/addresses/${addressA.id}`)
        .set('Authorization', `Bearer ${tokenB}`);
      expect(deleteRes.status).toBe(404);
      expect(errorResponseSchema.parse(deleteRes.body as unknown).error.code).toBe(
        'ADDRESS_NOT_FOUND',
      );

      // User B cố gắng set default địa chỉ của User A -> 404 NOT_FOUND
      const defaultRes = await request(app)
        .patch(`/api/v1/users/me/addresses/${addressA.id}/default`)
        .set('Authorization', `Bearer ${tokenB}`);
      expect(defaultRes.status).toBe(404);
      expect(errorResponseSchema.parse(defaultRes.body as unknown).error.code).toBe(
        'ADDRESS_NOT_FOUND',
      );

      // User A xóa thành công địa chỉ của mình
      const validDelete = await request(app)
        .delete(`/api/v1/users/me/addresses/${addressA.id}`)
        .set('Authorization', `Bearer ${tokenA}`);
      expect(validDelete.status).toBe(200);
      expect(successMessageResponseSchema.parse(validDelete.body as unknown).data.message).toBe(
        'Address deleted successfully',
      );

      // Kiểm tra lại danh sách của User A -> rỗng
      const emptyList = await request(app)
        .get('/api/v1/users/me/addresses')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(addressListResponseSchema.parse(emptyList.body as unknown).data.addresses).toEqual([]);
    });

    it('handles concurrent address creation and guarantees exactly one default address', async () => {
      // Gửi 2 request tạo địa chỉ đồng thời khi user chưa có địa chỉ nào
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/v1/users/me/addresses')
          .set('Authorization', `Bearer ${tokenA}`)
          .send(address1),
        request(app)
          .post('/api/v1/users/me/addresses')
          .set('Authorization', `Bearer ${tokenA}`)
          .send(address2),
      ]);

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);

      const listRes = await request(app)
        .get('/api/v1/users/me/addresses')
        .set('Authorization', `Bearer ${tokenA}`);

      const addresses = addressListResponseSchema.parse(listRes.body as unknown).data.addresses;
      expect(addresses.length).toBe(2);

      const defaultAddresses = addresses.filter((a) => a.isDefault);
      expect(defaultAddresses.length).toBe(1);
    });

    it('validates Vietnamese phone number and rejects literal pipe character', async () => {
      // Phone chứa ký tự pipe literal |
      const pipePhoneRes1 = await request(app)
        .post('/api/v1/users/me/addresses')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          ...address1,
          phone: '0|12345678',
        });
      expect(pipePhoneRes1.status).toBe(422);
      expect(errorResponseSchema.parse(pipePhoneRes1.body as unknown).error.code).toBe(
        'VALIDATION_ERROR',
      );

      const pipePhoneRes2 = await request(app)
        .post('/api/v1/users/me/addresses')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          ...address1,
          phone: '+84|12345678',
        });
      expect(pipePhoneRes2.status).toBe(422);

      // Phone quá ngắn hoặc không đúng đầu số
      const invalidPhoneRes = await request(app)
        .post('/api/v1/users/me/addresses')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          ...address1,
          phone: '12345',
        });
      expect(invalidPhoneRes.status).toBe(422);
      expect(errorResponseSchema.parse(invalidPhoneRes.body as unknown).error.code).toBe(
        'VALIDATION_ERROR',
      );

      const invalidUuidRes = await request(app)
        .patch('/api/v1/users/me/addresses/not-a-uuid')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ recipientName: 'Test' });
      expect(invalidUuidRes.status).toBe(422);
    });
  });
});
