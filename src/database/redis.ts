import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    redisClient.on('connect', () => {
      logger.info('Connected to Redis');
    });

    redisClient.on('error', (error) => {
      logger.error({ error }, 'Redis client connection error');
    });
  }

  return redisClient;
}

/**
 * Ping Redis cho readiness check. Client dùng `maxRetriesPerRequest: null` nên lệnh sẽ bị
 * queue vô hạn khi mất kết nối; cần timeout để /health/ready trả 503 thay vì treo.
 */
export async function pingRedis(timeoutMs = 1000): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });

  try {
    const result = await Promise.race([
      getRedisClient()
        .ping()
        .then((reply) => reply === 'PONG'),
      timeout,
    ]);
    return result;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch (error) {
      logger.warn({ error }, 'Failed to cleanly quit Redis connection, forcing disconnect');
      redisClient.disconnect();
    } finally {
      redisClient = null;
    }
  }
}
