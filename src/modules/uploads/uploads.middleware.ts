import type { RequestHandler } from 'express';
import multer from 'multer';
import { ERROR_CODES } from '../../constants/index.js';
import { AppError } from '../../utils/app-error.js';
import type { UploadPolicy } from './uploads.policy.js';

export function uploadSingleImage(policy: UploadPolicy): RequestHandler {
  const parser = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: policy.maxSizeBytes, files: 1 },
    fileFilter: (_request, file, callback) => {
      const mimeType = file.mimetype.toLowerCase().trim();
      if (!policy.allowedMimeTypes.includes(mimeType)) {
        callback(new AppError(422, ERROR_CODES.INVALID_FILE_TYPE));
        return;
      }

      callback(null, true);
    },
  }).single('file');

  return (request, response, next) => {
    parser(request, response, (error: unknown) => {
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        next(new AppError(422, ERROR_CODES.FILE_SIZE_EXCEEDED));
        return;
      }

      if (error instanceof multer.MulterError) {
        next(new AppError(422, ERROR_CODES.VALIDATION_ERROR));
        return;
      }

      if (error) {
        next(error);
        return;
      }

      if (!request.file) {
        next(new AppError(422, ERROR_CODES.FILE_REQUIRED));
        return;
      }

      next();
    });
  };
}

export function getUploadedImage(file: Express.Multer.File | undefined): Express.Multer.File {
  if (!file) {
    throw new AppError(422, ERROR_CODES.FILE_REQUIRED);
  }

  return file;
}
