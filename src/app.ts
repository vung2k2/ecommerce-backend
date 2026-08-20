import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma } from './database/prisma.js';
import { getOpenApiDocument } from './docs/openapi.js';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';
import { apiRouter } from './routes/api.routes.js';

export function createApp() {
  const app = express();

  // Ẩn thông tin Express khỏi response header
  app.disable('x-powered-by');

  // Gắn request ID cho từng request và ghi access log bằng Pino.
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const requestId = req.headers['x-request-id']?.toString() ?? randomUUID();
        res.setHeader('x-request-id', requestId);
        return requestId;
      },
      serializers: {
        req: (req: IncomingMessage & { id?: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: ServerResponse) => ({
          statusCode: res.statusCode,
        }),
      },
    }),
  );

  // Thiết lập các HTTP security header phổ biến.
  app.use(helmet());

  // Chỉ cho phép các frontend đã cấu hình gọi API và gửi cookie xác thực.
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));

  // Parse JSON/form body và giới hạn kích thước.
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  // Parse Cookie header thành request.cookies.
  app.use(cookieParser());

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 200,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (req, res) => {
        res.status(429).json({
          error: {
            code: 'TOO_MANY_REQUESTS',
            message: 'Too many requests, please try again later.',
          },
          requestId: req.id,
        });
      },
    }),
  );

  app.get('/health/live', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/health/ready', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({ status: 'ready', dependencies: { database: 'up' } });
    } catch {
      res.status(503).json({ status: 'not_ready', dependencies: { database: 'down' } });
    }
  });

  // Swagger UI và OpenAPI JSON.
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(getOpenApiDocument()));
  app.get('/docs.json', (_request, response) => response.json(getOpenApiDocument()));

  // Mount toàn bộ API nghiệp vụ.
  app.use('/api/v1', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
