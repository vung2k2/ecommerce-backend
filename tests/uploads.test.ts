import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import { ERROR_CODES, PERMISSIONS, ROLES, UPLOAD_PURPOSES, type Role } from '../src/constants/index.js';
import { prisma } from '../src/database/prisma.js';
import { s3Service } from '../src/services/s3.service.js';
import { jwtService } from '../src/utils/jwt.js';

const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

const presignSuccessResponseSchema = z.object({
  data: z.object({
    uploadUrl: z.string(),
    fileKey: z.string(),
    fileUrl: z.string(),
    expiresInSeconds: z.number(),
  }),
});

type MockUserResult = {
  id: string;
  isActive: boolean;
  role: Role;
  permissions: { permission: string }[];
};

describe('Uploads Module - POST /api/v1/uploads/presign (HTTP Integration)', () => {
  const app = createApp();

  const adminId = randomUUID();
  const staffCatalogId = randomUUID();
  const staffNoCatalogId = randomUUID();
  const customerId = randomUUID();
  const inactiveId = randomUUID();

  let adminToken: string;
  let staffCatalogToken: string;
  let staffNoCatalogToken: string;
  let customerToken: string;
  let inactiveToken: string;

  beforeEach(() => {
    vi.restoreAllMocks();

    adminToken = jwtService.signAccessToken({
      userId: adminId,
      role: ROLES.ADMIN,
    });
    staffCatalogToken = jwtService.signAccessToken({
      userId: staffCatalogId,
      role: ROLES.STAFF,
    });
    staffNoCatalogToken = jwtService.signAccessToken({
      userId: staffNoCatalogId,
      role: ROLES.STAFF,
    });
    customerToken = jwtService.signAccessToken({
      userId: customerId,
      role: ROLES.CUSTOMER,
    });
    inactiveToken = jwtService.signAccessToken({
      userId: inactiveId,
      role: ROLES.CUSTOMER,
    });

    vi.spyOn(s3Service, 'generatePresignedUploadUrl').mockImplementation((params) =>
      Promise.resolve({
        uploadUrl: `https://ecommerce-assets.s3.ap-southeast-1.amazonaws.com/${params.key}?AWSAccessKeyId=MOCK`,
        fileKey: params.key,
        fileUrl: `https://ecommerce-assets.s3.ap-southeast-1.amazonaws.com/${params.key}`,
        expiresInSeconds: params.expiresInSeconds ?? 600,
      }),
    );
  });

  it('returns 401 UNAUTHORIZED when no token is provided', async () => {
    const res = await request(app).post('/api/v1/uploads/presign').send({
      purpose: UPLOAD_PURPOSES.PRODUCT_IMAGE,
      fileName: 'macbook.jpg',
      mimeType: 'image/jpeg',
      fileSize: 1024 * 1024,
    });

    expect(res.status).toBe(401);
    const body = errorResponseSchema.parse(res.body);
    expect(body.error.code).toBe(ERROR_CODES.UNAUTHORIZED);
  });

  it('returns 403 INACTIVE_ACCOUNT when account is deactivated', async () => {
    const mockUser: MockUserResult = {
      id: inactiveId,
      isActive: false,
      role: ROLES.CUSTOMER,
      permissions: [],
    };
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(mockUser as never);

    const res = await request(app)
      .post('/api/v1/uploads/presign')
      .set('Authorization', `Bearer ${inactiveToken}`)
      .send({
        purpose: UPLOAD_PURPOSES.USER_AVATAR,
        fileName: 'avatar.jpg',
        mimeType: 'image/jpeg',
        fileSize: 500 * 1024,
      });

    expect(res.status).toBe(403);
    const body = errorResponseSchema.parse(res.body);
    expect(body.error.code).toBe(ERROR_CODES.INACTIVE_ACCOUNT);
  });

  it('returns 422 VALIDATION_ERROR for invalid request body', async () => {
    const res = await request(app)
      .post('/api/v1/uploads/presign')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        purpose: 'INVALID_PURPOSE',
        fileName: '',
        mimeType: '',
        fileSize: -10,
      });

    expect(res.status).toBe(422);
    const body = errorResponseSchema.parse(res.body);
    expect(body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
  });

  describe('Authorization Rules by Purpose', () => {
    it('rejects CUSTOMER requesting PRODUCT_IMAGE upload with 403 FORBIDDEN', async () => {
      const mockUser: MockUserResult = {
        id: customerId,
        isActive: true,
        role: ROLES.CUSTOMER,
        permissions: [],
      };
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(mockUser as never);

      const res = await request(app)
        .post('/api/v1/uploads/presign')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          purpose: UPLOAD_PURPOSES.PRODUCT_IMAGE,
          fileName: 'laptop.jpg',
          mimeType: 'image/jpeg',
          fileSize: 1024 * 1024,
        });

      expect(res.status).toBe(403);
      const body = errorResponseSchema.parse(res.body);
      expect(body.error.code).toBe(ERROR_CODES.FORBIDDEN);
    });

    it('rejects STAFF without catalog:write requesting PRODUCT_IMAGE upload with 403 FORBIDDEN', async () => {
      const mockUser: MockUserResult = {
        id: staffNoCatalogId,
        isActive: true,
        role: ROLES.STAFF,
        permissions: [],
      };
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(mockUser as never);

      const res = await request(app)
        .post('/api/v1/uploads/presign')
        .set('Authorization', `Bearer ${staffNoCatalogToken}`)
        .send({
          purpose: UPLOAD_PURPOSES.PRODUCT_IMAGE,
          fileName: 'laptop.jpg',
          mimeType: 'image/jpeg',
          fileSize: 1024 * 1024,
        });

      expect(res.status).toBe(403);
      const body = errorResponseSchema.parse(res.body);
      expect(body.error.code).toBe(ERROR_CODES.FORBIDDEN);
    });

    it('allows STAFF with catalog:write to request PRODUCT_IMAGE upload', async () => {
      const mockUser: MockUserResult = {
        id: staffCatalogId,
        isActive: true,
        role: ROLES.STAFF,
        permissions: [{ permission: PERMISSIONS.CATALOG_WRITE }],
      };
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(mockUser as never);

      const res = await request(app)
        .post('/api/v1/uploads/presign')
        .set('Authorization', `Bearer ${staffCatalogToken}`)
        .send({
          purpose: UPLOAD_PURPOSES.PRODUCT_IMAGE,
          fileName: 'laptop.jpg',
          mimeType: 'image/jpeg',
          fileSize: 1024 * 1024,
        });

      expect(res.status).toBe(200);
      const body = presignSuccessResponseSchema.parse(res.body);
      expect(body.data.uploadUrl).toBeDefined();
      expect(body.data.fileKey).toMatch(
        new RegExp(`^temp/products/${staffCatalogId}/[a-f0-9-]+\\.jpg$`),
      );
      expect(body.data.fileUrl).toContain(body.data.fileKey);
      expect(body.data.expiresInSeconds).toBe(600);
    });

    it('allows ADMIN to request a raster BRAND_LOGO upload', async () => {
      const mockUser: MockUserResult = {
        id: adminId,
        isActive: true,
        role: ROLES.ADMIN,
        permissions: [],
      };
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(mockUser as never);

      const res = await request(app)
        .post('/api/v1/uploads/presign')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          purpose: UPLOAD_PURPOSES.BRAND_LOGO,
          fileName: 'apple.png',
          mimeType: 'image/png',
          fileSize: 500 * 1024,
        });

      expect(res.status).toBe(200);
      const body = presignSuccessResponseSchema.parse(res.body);
      expect(body.data.fileKey).toMatch(
        new RegExp(`^temp/brands/${adminId}/[a-f0-9-]+\\.png$`),
      );
    });

    it('allows CUSTOMER to request USER_AVATAR upload', async () => {
      const mockUser: MockUserResult = {
        id: customerId,
        isActive: true,
        role: ROLES.CUSTOMER,
        permissions: [],
      };
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(mockUser as never);

      const res = await request(app)
        .post('/api/v1/uploads/presign')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          purpose: UPLOAD_PURPOSES.USER_AVATAR,
          fileName: 'my-avatar.png',
          mimeType: 'image/png',
          fileSize: 500 * 1024,
        });

      expect(res.status).toBe(200);
      const body = presignSuccessResponseSchema.parse(res.body);
      expect(body.data.fileKey).toMatch(
        new RegExp(`^temp/avatars/${customerId}/[a-f0-9-]+\\.png$`),
      );
    });

    it('allows CUSTOMER to request REVIEW_IMAGE upload', async () => {
      const mockUser: MockUserResult = {
        id: customerId,
        isActive: true,
        role: ROLES.CUSTOMER,
        permissions: [],
      };
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(mockUser as never);

      const res = await request(app)
        .post('/api/v1/uploads/presign')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          purpose: UPLOAD_PURPOSES.REVIEW_IMAGE,
          fileName: 'review-pic.webp',
          mimeType: 'image/webp',
          fileSize: 1024 * 1024,
        });

      expect(res.status).toBe(200);
      const body = presignSuccessResponseSchema.parse(res.body);
      expect(body.data.fileKey).toMatch(
        new RegExp(`^temp/reviews/${customerId}/[a-f0-9-]+\\.webp$`),
      );
    });
  });

  describe('Validation: File Type & Size Limits', () => {
    it('returns 422 INVALID_FILE_TYPE when MIME type is not allowed for purpose', async () => {
      const mockUser: MockUserResult = {
        id: adminId,
        isActive: true,
        role: ROLES.ADMIN,
        permissions: [],
      };
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(mockUser as never);

      const res = await request(app)
        .post('/api/v1/uploads/presign')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          purpose: UPLOAD_PURPOSES.PRODUCT_IMAGE,
          fileName: 'manual.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024 * 1024,
        });

      expect(res.status).toBe(422);
      const body = errorResponseSchema.parse(res.body);
      expect(body.error.code).toBe(ERROR_CODES.INVALID_FILE_TYPE);
    });

    it('returns 422 INVALID_FILE_TYPE when SVG is used for USER_AVATAR', async () => {
      const mockUser: MockUserResult = {
        id: customerId,
        isActive: true,
        role: ROLES.CUSTOMER,
        permissions: [],
      };
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(mockUser as never);

      const res = await request(app)
        .post('/api/v1/uploads/presign')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          purpose: UPLOAD_PURPOSES.USER_AVATAR,
          fileName: 'avatar.svg',
          mimeType: 'image/svg+xml',
          fileSize: 100 * 1024,
        });

      expect(res.status).toBe(422);
      const body = errorResponseSchema.parse(res.body);
      expect(body.error.code).toBe(ERROR_CODES.INVALID_FILE_TYPE);
    });

    it('returns 422 FILE_SIZE_EXCEEDED when file exceeds USER_AVATAR 2MB limit', async () => {
      const mockUser: MockUserResult = {
        id: customerId,
        isActive: true,
        role: ROLES.CUSTOMER,
        permissions: [],
      };
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(mockUser as never);

      const res = await request(app)
        .post('/api/v1/uploads/presign')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          purpose: UPLOAD_PURPOSES.USER_AVATAR,
          fileName: 'avatar.png',
          mimeType: 'image/png',
          fileSize: 3 * 1024 * 1024, // 3MB > 2MB limit
        });

      expect(res.status).toBe(422);
      const body = errorResponseSchema.parse(res.body);
      expect(body.error.code).toBe(ERROR_CODES.FILE_SIZE_EXCEEDED);
    });

    it('returns 422 FILE_SIZE_EXCEEDED when file exceeds PRODUCT_IMAGE 10MB limit', async () => {
      const mockUser: MockUserResult = {
        id: adminId,
        isActive: true,
        role: ROLES.ADMIN,
        permissions: [],
      };
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(mockUser as never);

      const res = await request(app)
        .post('/api/v1/uploads/presign')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          purpose: UPLOAD_PURPOSES.PRODUCT_IMAGE,
          fileName: 'giant-photo.jpg',
          mimeType: 'image/jpeg',
          fileSize: 15 * 1024 * 1024, // 15MB > 10MB limit
        });

      expect(res.status).toBe(422);
      const body = errorResponseSchema.parse(res.body);
      expect(body.error.code).toBe(ERROR_CODES.FILE_SIZE_EXCEEDED);
    });
  });
});
