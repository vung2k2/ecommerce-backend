import type { ErrorCode } from '../constants/index.js';
import { translateError } from '../i18n/index.js';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
  ) {
    super(translateError('en', code));
    this.name = 'AppError';
  }
}
