import { z } from '../../utils/zod.js';
import { registry } from '../../docs/registry.js';
import { UPLOAD_PURPOSES } from '../../constants/index.js';

export const presignUploadBodySchema = z.object({
  purpose: z
    .nativeEnum(UPLOAD_PURPOSES, {
      message: 'validation.purposeRequired',
    })
    .openapi({
      example: 'PRODUCT_IMAGE',
      description: 'Upload purpose determining allowed file constraints and target folder',
    }),
  fileName: z
    .string()
    .trim()
    .min(1, 'validation.fileNameRequired')
    .max(255)
    .openapi({
      example: 'macbook-pro.jpg',
      description: 'Original display name; the storage extension is derived from MIME type',
    }),
  mimeType: z
    .string()
    .trim()
    .min(1, 'validation.mimeTypeRequired')
    .openapi({ example: 'image/jpeg', description: 'MIME type of the file' }),
  fileSize: z
    .number()
    .int()
    .positive('validation.fileSizePositive')
    .openapi({ example: 1048576, description: 'File size in bytes' }),
});
registry.register('PresignUploadDto', presignUploadBodySchema);

export const presignUploadResponseSchema = z.object({
  uploadUrl: z
    .string()
    .url()
    .openapi({
      example:
        'https://ecommerce-assets.s3.ap-southeast-1.amazonaws.com/temp/products/user-id/a1b2c3d4.jpg?X-Amz-Algorithm=...',
      description: 'Presigned S3 PUT URL for direct client upload',
    }),
  fileKey: z
    .string()
    .openapi({
      example: 'temp/products/3fa85f64-5717-4562-b3fc-2c963f66afa6/a1b2c3d4-5678-90ab-cdef-1234567890ab.jpg',
      description: 'S3 object key under the temp/ prefix',
    }),
  fileUrl: z
    .string()
    .url()
    .openapi({
      example:
        'https://ecommerce-assets.s3.ap-southeast-1.amazonaws.com/temp/products/3fa85f64-5717-4562-b3fc-2c963f66afa6/a1b2c3d4-5678-90ab-cdef-1234567890ab.jpg',
      description: 'Temporary object URL to submit to the matching domain API after upload',
    }),
  expiresInSeconds: z
    .number()
    .int()
    .openapi({ example: 600, description: 'Presigned URL expiration time in seconds' }),
});
registry.register('PresignUploadResponseDto', presignUploadResponseSchema);

export type PresignUploadDto = z.infer<typeof presignUploadBodySchema>;
export type PresignUploadResponseDto = z.infer<typeof presignUploadResponseSchema>;
