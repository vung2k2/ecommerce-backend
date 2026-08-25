import { Router } from 'express';
import { ERROR_CODES } from '../../constants/index.js';
import {
  createSuccessResponseSchema,
  errorResponse,
  registry,
} from '../../docs/registry.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { validateBody } from '../../middlewares/validate.middleware.js';
import { uploadsController } from './uploads.controller.js';
import {
  presignUploadBodySchema,
  presignUploadResponseSchema,
} from './uploads.schema.js';

export const uploadsRouter = Router();

//#region Routes

uploadsRouter.post(
  '/presign',
  requireAuth,
  validateBody(presignUploadBodySchema),
  uploadsController.presign,
);

//#endregion

//#region Docs

registry.registerPath({
  method: 'post',
  path: '/uploads/presign',
  summary: 'Generate S3 presigned PUT URL for direct file upload',
  description:
    'Generates an owner-scoped temporary S3 presigned PUT URL. The returned fileUrl must be submitted to the matching API after upload; permanent object URLs are not accepted as upload input.',
  tags: ['Uploads'],
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: presignUploadBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Presigned upload URL generated successfully',
      content: {
        'application/json': {
          schema: createSuccessResponseSchema(presignUploadResponseSchema),
        },
      },
    },
    422: errorResponse([ERROR_CODES.INVALID_FILE_TYPE, ERROR_CODES.FILE_SIZE_EXCEEDED]),
  },
});

//#endregion
