import type { RequestHandler } from 'express';
import { sendSuccess } from '../../utils/response.js';
import type { PresignUploadDto } from './uploads.schema.js';
import { uploadsService } from './uploads.service.js';

export const uploadsController = {
  presign: (async (req, res) => {
    const result = await uploadsService.generatePresignedUploadUrl({
      user: req.user,
      dto: req.body,
    });
    return sendSuccess(res, result, 200);
  }) as RequestHandler<Record<string, never>, unknown, PresignUploadDto>,
};
