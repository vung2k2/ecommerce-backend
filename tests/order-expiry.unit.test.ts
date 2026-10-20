import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUDIT_ACTIONS,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  PAYMENT_TRANSACTION_STATUSES,
} from '../src/constants/index.js';
import { prisma } from '../src/database/prisma.js';
import {
  cancelOrderExpiryJob,
  scheduleOrderExpiry,
} from '../src/jobs/order-expiry.job.js';
import { auditRepository } from '../src/modules/audit/audit.repository.js';
import { couponRepository } from '../src/modules/coupons/coupons.repository.js';
import { inventoryService } from '../src/modules/inventory/inventory.service.js';
import { orderRepository } from '../src/modules/orders/orders.repository.js';
import { orderService } from '../src/modules/orders/orders.service.js';

// Mock the Redis client so lazy-init Queue never opens a real connection
vi.mock('../src/database/redis.js', () => ({
  getRedisClient: vi.fn().mockReturnValue({
    duplicate: vi.fn().mockReturnValue({
      on: vi.fn(),
      status: 'ready',
    }),
  }),
}));

// Mock BullMQ so no real Redis connection is attempted
const mockQueueAdd = vi.fn();
const mockQueueGetJob = vi.fn();
const mockQueueClose = vi.fn();
const mockQueueOn = vi.fn();

vi.mock('bullmq', () => {
  return {
    Queue: function () {
      return {
        add: mockQueueAdd,
        getJob: mockQueueGetJob,
        close: mockQueueClose,
        on: mockQueueOn,
      };
    },
    Worker: function () {
      return {
        on: vi.fn(),
        close: vi.fn(),
      };
    },
  };
});

describe('Order Expiry & BullMQ Job Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockQueueAdd.mockReset();
    mockQueueGetJob.mockReset();
    mockQueueClose.mockReset();
  });

  describe('orderService.expireOrder', () => {
    const mockPendingOrder = {
      id: 'order-123',
      orderNumber: 'ORD-20261012-0001',
      userId: 'user-123',
      status: ORDER_STATUSES.PENDING_PAYMENT,
      paymentMethod: 'STRIPE',
      paymentStatus: PAYMENT_STATUSES.PENDING,
      subtotalAmount: 500000n,
      discountAmount: 50000n,
      shippingFee: 0n,
      totalAmount: 450000n,
      couponCode: 'SALE10',
      notes: null,
      cancelReason: null,
      cancelledAt: null,
      deliveredAt: null,
      recipientName: 'Customer',
      phone: '0987654321',
      province: 'HN',
      district: 'BD',
      ward: 'DB',
      streetAddress: '123 Str',
      items: [
        {
          id: 'item-1',
          variantId: 'variant-1',
          productName: 'Gaming Mouse',
          sku: 'GM-01',
          quantity: 2,
          unitPrice: 250000n,
          totalPrice: 500000n,
          options: null,
          createdAt: new Date(),
        },
      ],
      statusHistory: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('returns null when order is not found', async () => {
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
        return callback({} as never);
      });
      vi.spyOn(orderRepository, 'findForUpdate').mockResolvedValue(null);

      const result = await orderService.expireOrder('non-existent-order');

      expect(result).toBeNull();
    });

    it('skips expiration if order is already CONFIRMED or PAID', async () => {
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
        return callback({} as never);
      });
      vi.spyOn(orderRepository, 'findForUpdate').mockResolvedValue({
        ...mockPendingOrder,
        status: ORDER_STATUSES.CONFIRMED,
        paymentStatus: PAYMENT_STATUSES.PAID,
      } as never);

      const releaseSpy = vi.spyOn(inventoryService, 'releaseReservation');
      const updateStatusSpy = vi.spyOn(orderRepository, 'updateOrderStatus');

      const result = await orderService.expireOrder('order-123');

      expect(result?.status).toBe(ORDER_STATUSES.CONFIRMED);
      expect(releaseSpy).not.toHaveBeenCalled();
      expect(updateStatusSpy).not.toHaveBeenCalled();
    });

    it('successfully transitions PENDING_PAYMENT order to PAYMENT_EXPIRED and releases reservations', async () => {
      const mockTx = {
        coupon: { update: vi.fn().mockResolvedValue({}) },
        couponUsage: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
        paymentTransaction: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
        return callback(mockTx as never);
      });

      vi.spyOn(orderRepository, 'findForUpdate').mockResolvedValue(mockPendingOrder as never);
      const updateStatusSpy = vi
        .spyOn(orderRepository, 'updateOrderStatus')
        .mockResolvedValue(mockPendingOrder as never);
      const releaseSpy = vi
        .spyOn(inventoryService, 'releaseReservation')
        .mockResolvedValue({} as never);
      vi.spyOn(couponRepository, 'findByCode').mockResolvedValue({ id: 'coupon-1' } as never);
      const historySpy = vi
        .spyOn(orderRepository, 'createStatusHistory')
        .mockResolvedValue({} as never);
      const auditSpy = vi
        .spyOn(auditRepository, 'createAuditLog')
        .mockResolvedValue({} as never);
      vi.spyOn(orderRepository, 'findById').mockResolvedValue({
        ...mockPendingOrder,
        status: ORDER_STATUSES.PAYMENT_EXPIRED,
        paymentStatus: PAYMENT_STATUSES.EXPIRED,
      } as never);

      const result = await orderService.expireOrder(
        'order-123',
        'Payment timeout: Order expired automatically by BullMQ queue worker',
      );

      expect(result?.status).toBe(ORDER_STATUSES.PAYMENT_EXPIRED);
      expect(updateStatusSpy).toHaveBeenCalledWith(
        'order-123',
        {
          status: ORDER_STATUSES.PAYMENT_EXPIRED,
          paymentStatus: PAYMENT_STATUSES.EXPIRED,
        },
        mockTx,
      );
      expect(releaseSpy).toHaveBeenCalledWith(
        'variant-1',
        2,
        'ORD-20261012-0001',
        null,
        mockTx,
      );
      expect(mockTx.coupon.update).toHaveBeenCalledWith({
        where: { id: 'coupon-1' },
        data: { usedCount: { decrement: 1 } },
      });
      expect(mockTx.couponUsage.deleteMany).toHaveBeenCalledWith({
        where: { orderId: 'order-123' },
      });
      expect(mockTx.paymentTransaction.updateMany).toHaveBeenCalledWith({
        where: { orderId: 'order-123', status: PAYMENT_TRANSACTION_STATUSES.PENDING },
        data: { status: PAYMENT_TRANSACTION_STATUSES.EXPIRED },
      });
      expect(historySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'order-123',
          fromStatus: ORDER_STATUSES.PENDING_PAYMENT,
          toStatus: ORDER_STATUSES.PAYMENT_EXPIRED,
        }),
        mockTx,
      );
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AUDIT_ACTIONS.ORDER_STATUS_UPDATED,
          targetId: 'order-123',
        }),
        mockTx,
      );
    });
  });

  describe('BullMQ Queue helpers', () => {
    it('schedules order expiry with 15 minutes delay and unique jobId', async () => {
      mockQueueAdd.mockResolvedValue({});

      await scheduleOrderExpiry('order-abc');

      expect(mockQueueAdd).toHaveBeenCalledWith(
        'expire-order',
        { orderId: 'order-abc' },
        {
          delay: 15 * 60 * 1000,
          jobId: 'order-expiry-order-abc',
          removeOnComplete: true,
          removeOnFail: { count: 50, age: 86_400 },
        },
      );
    });

    it('cancels order expiry job by removing it from the queue', async () => {
      const removeMock = vi.fn().mockResolvedValue(undefined);
      mockQueueGetJob.mockResolvedValue({ remove: removeMock });

      await cancelOrderExpiryJob('order-abc');

      expect(mockQueueGetJob).toHaveBeenCalledWith('order-expiry-order-abc');
      expect(removeMock).toHaveBeenCalled();
    });

    it('throws when scheduleOrderExpiry fails due to queue errors', async () => {
      mockQueueAdd.mockRejectedValue(new Error('Redis connection refused'));

      await expect(scheduleOrderExpiry('order-error')).rejects.toThrow('Redis connection refused');
    });

    it('does not throw when cancelOrderExpiryJob fails', async () => {
      mockQueueGetJob.mockRejectedValue(new Error('Redis error'));

      await expect(cancelOrderExpiryJob('order-error')).resolves.toBeUndefined();
    });
  });
});
