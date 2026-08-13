import type { AccessTokenPayload } from '../utils/jwt.js';

declare global {
  namespace Express {
    interface Request {
      id: string;
      user: AccessTokenPayload;
    }
  }
}

export {};
