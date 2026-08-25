import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ERROR_CODES, PERMISSIONS, ROLES, UPLOAD_PURPOSES, type Role } from '../src/constants/index.js';
import { prisma } from '../src/database/prisma.js';
import { uploadsService } from '../src/modules/uploads/uploads.service.js';
import { s3Service, type PresignedUploadResult } from '../src/services/s3.service.js';

type MockUserResult = {
  id: string;
  isActive: boolean;
  role: Role;
  permissions: { permission: string }[];
};

describe('UploadsService Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('throws 403 INACTIVE_ACCOUNT if user is deactivated', async () => {
    const mockUser: MockUserResult = {
      id: 'user-inactive',
      isActive: false,
      role: ROLES.CUSTOMER,
      permissions: [],
    };
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(mockUser as never);

    await expect(
      uploadsService.generatePresignedUploadUrl({
        user: { userId: 'user-inactive', role: ROLES.CUSTOMER, iat: 0, exp: 0, tokenType: 'access' },
        dto: {
          purpose: UPLOAD_PURPOSES.USER_AVATAR,
          fileName: 'avatar.jpg',
          mimeType: 'image/jpeg',
          fileSize: 1000,
        },
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        statusCode: 403,
        code: ERROR_CODES.INACTIVE_ACCOUNT,
      }),
    );
  });

  it('rejects CUSTOMER trying to upload PRODUCT_IMAGE with 403 FORBIDDEN', async () => {
    const mockUser: MockUserResult = {
      id: 'customer-1',
      isActive: true,
      role: ROLES.CUSTOMER,
      permissions: [],
    };
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(mockUser as never);

    await expect(
      uploadsService.generatePresignedUploadUrl({
        user: { userId: 'customer-1', role: ROLES.CUSTOMER, iat: 0, exp: 0, tokenType: 'access' },
        dto: {
          purpose: UPLOAD_PURPOSES.PRODUCT_IMAGE,
          fileName: 'product.jpg',
          mimeType: 'image/jpeg',
          fileSize: 1000,
        },
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        statusCode: 403,
        code: ERROR_CODES.FORBIDDEN,
      }),
    );
  });

  it('rejects STAFF without catalog:write trying to upload BRAND_LOGO with 403 FORBIDDEN', async () => {
    const mockUser: MockUserResult = {
      id: 'staff-no-perm',
      isActive: true,
      role: ROLES.STAFF,
      permissions: [],
    };
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(mockUser as never);

    await expect(
      uploadsService.generatePresignedUploadUrl({
        user: { userId: 'staff-no-perm', role: ROLES.STAFF, iat: 0, exp: 0, tokenType: 'access' },
        dto: {
          purpose: UPLOAD_PURPOSES.BRAND_LOGO,
          fileName: 'logo.png',
          mimeType: 'image/png',
          fileSize: 1000,
        },
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        statusCode: 403,
        code: ERROR_CODES.FORBIDDEN,
      }),
    );
  });

  it('rejects invalid MIME type with 422 INVALID_FILE_TYPE', async () => {
    const mockUser: MockUserResult = {
      id: 'admin-1',
      isActive: true,
      role: ROLES.ADMIN,
      permissions: [],
    };
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(mockUser as never);

    await expect(
      uploadsService.generatePresignedUploadUrl({
        user: { userId: 'admin-1', role: ROLES.ADMIN, iat: 0, exp: 0, tokenType: 'access' },
        dto: {
          purpose: UPLOAD_PURPOSES.PRODUCT_IMAGE,
          fileName: 'doc.pdf',
          mimeType: 'application/pdf',
          fileSize: 1000,
        },
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        statusCode: 422,
        code: ERROR_CODES.INVALID_FILE_TYPE,
      }),
    );
  });

  it('rejects file exceeding size limit with 422 FILE_SIZE_EXCEEDED', async () => {
    const mockUser: MockUserResult = {
      id: 'cust-1',
      isActive: true,
      role: ROLES.CUSTOMER,
      permissions: [],
    };
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(mockUser as never);

    await expect(
      uploadsService.generatePresignedUploadUrl({
        user: { userId: 'cust-1', role: ROLES.CUSTOMER, iat: 0, exp: 0, tokenType: 'access' },
        dto: {
          purpose: UPLOAD_PURPOSES.USER_AVATAR,
          fileName: 'big-avatar.jpg',
          mimeType: 'image/jpeg',
          fileSize: 3 * 1024 * 1024, // 3MB > 2MB limit
        },
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        statusCode: 422,
        code: ERROR_CODES.FILE_SIZE_EXCEEDED,
      }),
    );
  });

  it('generates presigned URL with correct temp path for authorized STAFF', async () => {
    const mockUser: MockUserResult = {
      id: 'staff-with-perm',
      isActive: true,
      role: ROLES.STAFF,
      permissions: [{ permission: PERMISSIONS.CATALOG_WRITE }],
    };
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(mockUser as never);

    const mockPresignedResult: PresignedUploadResult = {
      uploadUrl: 'https://s3.aws.com/presigned-put-url',
      fileKey: 'temp/products/staff-with-perm/uuid.jpg',
      fileUrl: 'https://cdn.example.com/temp/products/staff-with-perm/uuid.jpg',
      expiresInSeconds: 600,
    };
    const s3Spy = vi
      .spyOn(s3Service, 'generatePresignedUploadUrl')
      .mockResolvedValueOnce(mockPresignedResult);

    const result = await uploadsService.generatePresignedUploadUrl({
      user: { userId: 'staff-with-perm', role: ROLES.STAFF, iat: 0, exp: 0, tokenType: 'access' },
      dto: {
        purpose: UPLOAD_PURPOSES.PRODUCT_IMAGE,
        fileName: 'laptop.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024 * 1024,
      },
    });

    expect(result.uploadUrl).toBe('https://s3.aws.com/presigned-put-url');
    const callArgs = s3Spy.mock.calls[0]?.[0];
    expect(callArgs?.mimeType).toBe('image/jpeg');
    expect(callArgs?.fileSize).toBe(1024 * 1024);
    expect(callArgs?.expiresInSeconds).toBe(600);
    expect(callArgs?.key).toMatch(/^temp\/products\/staff-with-perm\/[a-f0-9-]+\.jpg$/);
  });

  it('allows CUSTOMER to request REVIEW_IMAGE upload into temp/reviews/{userId}/', async () => {
    const mockUser: MockUserResult = {
      id: 'cust-reviewer',
      isActive: true,
      role: ROLES.CUSTOMER,
      permissions: [],
    };
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(mockUser as never);

    const mockPresignedResult: PresignedUploadResult = {
      uploadUrl: 'https://s3.aws.com/presigned-put-url',
      fileKey: 'temp/reviews/cust-reviewer/uuid.webp',
      fileUrl: 'https://cdn.example.com/temp/reviews/cust-reviewer/uuid.webp',
      expiresInSeconds: 600,
    };
    const s3Spy = vi
      .spyOn(s3Service, 'generatePresignedUploadUrl')
      .mockResolvedValueOnce(mockPresignedResult);

    const result = await uploadsService.generatePresignedUploadUrl({
      user: { userId: 'cust-reviewer', role: ROLES.CUSTOMER, iat: 0, exp: 0, tokenType: 'access' },
      dto: {
        purpose: UPLOAD_PURPOSES.REVIEW_IMAGE,
        fileName: 'unnamed-file',
        mimeType: 'image/webp',
        fileSize: 500 * 1024,
      },
    });

    expect(result.uploadUrl).toBe('https://s3.aws.com/presigned-put-url');
    const reviewerCallArgs = s3Spy.mock.calls[0]?.[0];
    expect(reviewerCallArgs?.mimeType).toBe('image/webp');
    expect(reviewerCallArgs?.fileSize).toBe(500 * 1024);
    expect(reviewerCallArgs?.expiresInSeconds).toBe(600);
    expect(reviewerCallArgs?.key).toMatch(/^temp\/reviews\/cust-reviewer\/[a-f0-9-]+\.webp$/);
  });

  it('derives the object extension from MIME type instead of the client file name', async () => {
    const mockUser: MockUserResult = {
      id: 'cust-avatar',
      isActive: true,
      role: ROLES.CUSTOMER,
      permissions: [],
    };
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValueOnce(mockUser as never);
    const s3Spy = vi.spyOn(s3Service, 'generatePresignedUploadUrl').mockResolvedValueOnce({
      uploadUrl: 'https://s3.aws.com/presigned-put-url',
      fileKey: 'temp/avatars/cust-avatar/uuid.jpg',
      fileUrl: 'https://cdn.example.com/temp/avatars/cust-avatar/uuid.jpg',
      expiresInSeconds: 600,
    });

    await uploadsService.generatePresignedUploadUrl({
      user: { userId: 'cust-avatar', role: ROLES.CUSTOMER, iat: 0, exp: 0, tokenType: 'access' },
      dto: {
        purpose: UPLOAD_PURPOSES.USER_AVATAR,
        fileName: 'misleading.svg',
        mimeType: 'image/jpeg',
        fileSize: 1024,
      },
    });

    expect(s3Spy.mock.calls[0]?.[0].key).toMatch(/\.jpg$/);
  });
});
