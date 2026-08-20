import type { AccessTokenPayload } from '../utils/jwt.js';
import type { Locale } from '../i18n/index.js';

declare global {
  namespace Express {
    interface Request {
      id: string;
      locale?: Locale;
      user: AccessTokenPayload;
    }
  }
}

export {};
