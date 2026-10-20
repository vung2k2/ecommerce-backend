import { logger } from '../config/logger.js';
import {
  cancelOrderExpiryJob,
  closeOrderExpiryQueue,
  getOrderExpiryQueue,
  initOrderExpiryWorker,
  scheduleOrderExpiry,
} from './order-expiry.job.js';

export function startBackgroundJobs(): void {
  logger.info('Starting background job workers');
  initOrderExpiryWorker();
}

export async function stopBackgroundJobs(): Promise<void> {
  logger.info('Stopping background job workers');
  await closeOrderExpiryQueue();
}

export {
  cancelOrderExpiryJob,
  closeOrderExpiryQueue,
  getOrderExpiryQueue,
  initOrderExpiryWorker,
  scheduleOrderExpiry,
};
