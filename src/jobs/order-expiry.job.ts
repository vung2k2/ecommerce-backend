import { Queue, Worker, type Job } from 'bullmq';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { getRedisClient } from '../database/redis.js';
import { orderService } from '../modules/orders/orders.service.js';

export interface OrderExpiryJobData {
  orderId: string;
}

export const ORDER_EXPIRY_QUEUE_NAME = 'order-expiry';

// ---------------------------------------------------------------------------
// Lazy-initialised Queue & Worker
// Connections are only created when first accessed, not at import time.
// Queue reuses the shared Redis client (non-blocking commands).
// Worker needs a dedicated connection (uses BRPOPLPUSH / blocking commands).
// ---------------------------------------------------------------------------

let _queue: Queue<OrderExpiryJobData> | null = null;
let _worker: Worker<OrderExpiryJobData> | null = null;

export function getOrderExpiryQueue(): Queue<OrderExpiryJobData> {
  if (!_queue) {
    _queue = new Queue<OrderExpiryJobData>(ORDER_EXPIRY_QUEUE_NAME, {
      connection: getRedisClient().duplicate(),
    });

    _queue.on('error', (error) => {
      logger.error({ error }, 'BullMQ order-expiry queue connection error');
    });
  }
  return _queue;
}

export function initOrderExpiryWorker(): Worker<OrderExpiryJobData> {
  if (_worker) {
    return _worker;
  }

  _worker = new Worker<OrderExpiryJobData>(
    ORDER_EXPIRY_QUEUE_NAME,
    async (job: Job<OrderExpiryJobData>) => {
      const { orderId } = job.data;
      logger.info({ jobId: job.id, orderId }, 'BullMQ: processing order expiry job');

      await orderService.expireOrder(
        orderId,
        'Payment timeout: Order expired automatically by BullMQ queue worker',
      );
    },
    {
      connection: { url: env.REDIS_URL, maxRetriesPerRequest: null },
      concurrency: 5,
    },
  );

  _worker.on('completed', (job) => {
    logger.info({ jobId: job.id, orderId: job.data.orderId }, 'BullMQ: order expiry job completed');
  });

  _worker.on('failed', (job, error) => {
    logger.error(
      { jobId: job?.id, orderId: job?.data.orderId, error },
      'BullMQ: order expiry job failed',
    );
  });

  _worker.on('error', (error) => {
    logger.error({ error }, 'BullMQ: order expiry worker connection error');
  });

  return _worker;
}

export async function scheduleOrderExpiry(
  orderId: string,
  delayMs = 15 * 60 * 1000,
): Promise<void> {
  await getOrderExpiryQueue().add(
    'expire-order',
    { orderId },
    {
      delay: delayMs,
      jobId: `order-expiry-${orderId}`,
      removeOnComplete: true,
      removeOnFail: { count: 50, age: 86_400 },
    },
  );
  logger.info({ orderId, delayMs }, 'Scheduled BullMQ order expiry job');
}

export async function cancelOrderExpiryJob(orderId: string): Promise<void> {
  try {
    const job = await getOrderExpiryQueue().getJob(`order-expiry-${orderId}`);
    if (job) {
      await job.remove();
      logger.info({ orderId }, 'Cancelled BullMQ order expiry job');
    }
  } catch (error) {
    logger.warn({ error, orderId }, 'Failed to cancel BullMQ order expiry job');
  }
}

export async function closeOrderExpiryQueue(): Promise<void> {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
}
