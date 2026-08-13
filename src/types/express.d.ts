import type { JwtPayload } from '../utils/jwt.js';

declare global {
  namespace Express {
    interface Request {
      id: string;
      user: JwtPayload;
    }
  }
}

export {};
