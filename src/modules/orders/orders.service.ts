import { randomBytes } from 'node:crypto';
import {
  AUDIT_ACTIONS,
  ERROR_CODES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PAYMENT_TRANSACTION_STATUSES,
  type OrderStatus,
  type PaymentStatus,
} from '../../constants/index.js';
import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../utils/app-error.js';
import {
  calculateCouponDiscount,
  evaluateItemAvailability,
} from '../../utils/pricing.js';
import { auditRepository } from '../audit/audit.repository.js';
import { cartRepository } from '../cart/cart.repository.js';
import { couponRepository } from '../coupons/coupons.repository.js';
import { inventoryRepository } from '../inventory/inventory.repository.js';
import { inventoryService } from '../inventory/inventory.service.js';
import { orderRepository, type OrderWithDetailsRecord } from './orders.repository.js';
import type {
  CancelOrderDto,
  CheckoutDto,
  ListAdminOrdersQueryDto,
  ListCustomerOrdersQueryDto,
  UpdateOrderStatusDto,
} from './orders.schema.js';

// ==================== State Machine Definitions ====================

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [ORDER_STATUSES.PENDING_PAYMENT]: [
    ORDER_STATUSES.CONFIRMED,
    ORDER_STATUSES.CANCELLED,
    ORDER_STATUSES.PAYMENT_EXPIRED,
  ],
  [ORDER_STATUSES.CONFIRMED]: [
    ORDER_STATUSES.PROCESSING,
    ORDER_STATUSES.CANCELLED,
  ],
  [ORDER_STATUSES.PROCESSING]: [
    ORDER_STATUSES.SHIPPING,
    ORDER_STATUSES.CANCELLED,
  ],
  [ORDER_STATUSES.SHIPPING]: [
    ORDER_STATUSES.DELIVERED,
    ORDER_STATUSES.CANCELLED,
  ],
  [ORDER_STATUSES.DELIVERED]: [],
  [ORDER_STATUSES.CANCELLED]: [],
  [ORDER_STATUSES.PAYMENT_EXPIRED]: [],
};

// ==================== Helper Functions ====================

function generateOrderNumber(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomSuffix = randomBytes(3).toString('hex').toUpperCase();
  return `ORD-${dateStr}-${randomSuffix}`;
}

function mapOrderToResponse(order: OrderWithDetailsRecord) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    userId: order.userId,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    subtotalAmount: order.subtotalAmount.toString(),
    discountAmount: order.discountAmount.toString(),
    shippingFee: order.shippingFee.toString(),
    totalAmount: order.totalAmount.toString(),
    couponCode: order.couponCode,
    notes: order.notes,
    cancelReason: order.cancelReason,
    cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
    shippingAddress: {
      recipientName: order.recipientName,
      phone: order.phone,
      province: order.province,
      district: order.district,
      ward: order.ward,
      streetAddress: order.streetAddress,
    },
    totalItems: order.items.reduce((sum, item) => sum + item.quantity, 0),
    items: order.items.map((item) => ({
      id: item.id,
      variantId: item.variantId,
      productName: item.productName,
      sku: item.sku,
      options: item.options as Record<string, unknown> | null,
      unitPrice: item.unitPrice.toString(),
      quantity: item.quantity,
      totalPrice: item.totalPrice.toString(),
      createdAt: item.createdAt.toISOString(),
    })),
    statusHistory: order.statusHistory.map((history) => ({
      id: history.id,
      fromStatus: history.fromStatus,
      toStatus: history.toStatus,
      reason: history.reason,
      changedById: history.changedById,
      createdAt: history.createdAt.toISOString(),
    })),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

// ==================== Service ====================

export const orderService = {
  async checkout(userId: string, dto: CheckoutDto) {
    return prisma.$transaction(async (tx) => {
      // 1. Lock user's cart
      await cartRepository.getOrCreateCartAndLock(userId, tx);

      // 2. Fetch cart with items and variant inventory details
      const cart = await cartRepository.findCartByUserId(userId, tx);
      if (!cart || cart.items.length === 0) {
        throw new AppError(400, ERROR_CODES.ORDER_CART_EMPTY);
      }

      // 3. Check items availability and live pricing
      for (const item of cart.items) {
        const { isAvailable } = evaluateItemAvailability(item);
        if (!isAvailable) {
          throw new AppError(422, ERROR_CODES.ORDER_CART_ITEMS_UNAVAILABLE);
        }
      }

      // 4. Fetch and validate shipping address ownership
      const address = await tx.address.findUnique({
        where: { id: dto.addressId },
      });
      if (!address || address.userId !== userId) {
        throw new AppError(404, ERROR_CODES.ADDRESS_NOT_FOUND);
      }

      // 5. Calculate Subtotal from current database prices
      let subtotal = 0n;
      for (const item of cart.items) {
        subtotal += item.variant.price * BigInt(item.quantity);
      }

      // 6. Validate & Apply Coupon if provided
      let discountAmount = 0n;
      let appliedCouponId: string | null = null;
      let appliedCouponCode: string | null = null;

      if (dto.couponCode) {
        const coupon = await couponRepository.findByCode(dto.couponCode, tx);
        if (!coupon) {
          throw new AppError(404, ERROR_CODES.COUPON_NOT_FOUND);
        }

        // Lock coupon row for concurrency safety
        const lockedCoupon = await couponRepository.findForUpdate(coupon.id, tx);
        if (!lockedCoupon) {
          throw new AppError(404, ERROR_CODES.COUPON_NOT_FOUND);
        }

        if (!lockedCoupon.isActive) {
          throw new AppError(422, ERROR_CODES.COUPON_INACTIVE);
        }

        const now = new Date();
        if (now < lockedCoupon.startDate) {
          throw new AppError(422, ERROR_CODES.COUPON_NOT_STARTED);
        }
        if (now > lockedCoupon.endDate) {
          throw new AppError(422, ERROR_CODES.COUPON_EXPIRED);
        }

        if (subtotal < lockedCoupon.minOrderAmount) {
          throw new AppError(422, ERROR_CODES.COUPON_MIN_ORDER_NOT_MET);
        }

        if (lockedCoupon.usageLimit != null && lockedCoupon.usedCount >= lockedCoupon.usageLimit) {
          throw new AppError(422, ERROR_CODES.COUPON_USAGE_LIMIT_EXCEEDED);
        }

        const userUsageCount = await couponRepository.countUserUsages(lockedCoupon.id, userId, tx);
        if (
          lockedCoupon.usageLimitPerUser != null &&
          userUsageCount >= lockedCoupon.usageLimitPerUser
        ) {
          throw new AppError(422, ERROR_CODES.COUPON_USER_LIMIT_EXCEEDED);
        }

        const discountResult = calculateCouponDiscount(
          {
            discountType: lockedCoupon.discountType,
            discountValue: lockedCoupon.discountValue,
            maxDiscountAmount: lockedCoupon.maxDiscountAmount,
          },
          subtotal,
        );

        discountAmount = discountResult.discountAmount;
        appliedCouponId = lockedCoupon.id;
        appliedCouponCode = lockedCoupon.code;
      }

      // 7. Calculate shipping fee and final total
      const shippingFee = 0n; // Simple internal shipping calculation rule
      const totalAmount = subtotal - discountAmount + shippingFee;

      // 8. Generate Unique Order Number
      const orderNumber = generateOrderNumber();

      // 9. Reserve Stock for all items atomically
      for (const item of cart.items) {
        await inventoryService.reserveStock(
          item.variantId,
          item.quantity,
          orderNumber,
          userId,
          tx,
        );
      }

      // 10. Determine Initial Order & Payment Status
      const isCod = dto.paymentMethod === PAYMENT_METHODS.COD;
      const initialStatus = isCod ? ORDER_STATUSES.CONFIRMED : ORDER_STATUSES.PENDING_PAYMENT;
      const initialPaymentStatus = PAYMENT_STATUSES.PENDING;

      // 11. Create Order and snapshot items in Database
      const order = await orderRepository.createOrder(
        {
          orderNumber,
          userId,
          status: initialStatus,
          paymentMethod: dto.paymentMethod,
          paymentStatus: initialPaymentStatus,
          subtotalAmount: subtotal,
          discountAmount,
          shippingFee,
          totalAmount,
          recipientName: address.recipientName,
          phone: address.phone,
          province: address.province,
          district: address.district,
          ward: address.ward,
          streetAddress: address.streetAddress,
          couponCode: appliedCouponCode,
          notes: dto.notes,
          paymentExpiresAt: isCod ? null : new Date(Date.now() + 15 * 60 * 1000),
          items: cart.items.map((item) => ({
            variantId: item.variantId,
            productName: item.variant.product.name,
            sku: item.variant.sku,
            options: item.variant.options as Prisma.InputJsonValue | undefined,
            unitPrice: item.variant.price,
            quantity: item.quantity,
            totalPrice: item.variant.price * BigInt(item.quantity),
          })),
          initialHistoryReason: isCod
            ? 'Order placed via COD and auto-confirmed'
            : 'Order placed via VNPay, awaiting payment',
          actorId: userId,
        },
        tx,
      );

      // 12. Record coupon usage and increment count if coupon applied
      if (appliedCouponId) {
        await couponRepository.recordUsage(
          {
            couponId: appliedCouponId,
            userId,
            orderId: order.id,
            discountAmount,
          },
          tx,
        );
        await couponRepository.incrementUsedCount(appliedCouponId, tx);
      }

      // 13. If COD, commit reservation immediately
      if (isCod) {
        for (const item of cart.items) {
          await inventoryService.commitReservation(
            item.variantId,
            item.quantity,
            orderNumber,
            userId,
            tx,
          );
        }
      }

      // 14. Clear user's shopping cart
      await cartRepository.clearCart(cart.id, tx);

      // 15. Record audit log
      await auditRepository.createAuditLog(
        {
          actorId: userId,
          action: AUDIT_ACTIONS.ORDER_CREATED,
          targetType: 'ORDER',
          targetId: order.id,
          payload: {
            orderNumber,
            paymentMethod: dto.paymentMethod,
            totalAmount: totalAmount.toString(),
            itemCount: cart.items.length,
          },
        },
        tx,
      );

      return mapOrderToResponse(order);
    });
  },

  async getCustomerOrders(userId: string, query: ListCustomerOrdersQueryDto) {
    const result = await orderRepository.listCustomerOrders({
      userId,
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
    });

    return {
      items: result.items.map(mapOrderToResponse),
      total: result.total,
    };
  },

  async getCustomerOrderById(userId: string, orderId: string) {
    const order = await orderRepository.findById(orderId);
    if (!order || order.userId !== userId) {
      throw new AppError(404, ERROR_CODES.ORDER_NOT_FOUND);
    }
    return mapOrderToResponse(order);
  },

  async cancelCustomerOrder(userId: string, orderId: string, dto: CancelOrderDto) {
    return prisma.$transaction(async (tx) => {
      // 1. Lock order for update
      const order = await orderRepository.findForUpdate(orderId, tx);
      if (!order || order.userId !== userId) {
        throw new AppError(404, ERROR_CODES.ORDER_NOT_FOUND);
      }

      // 2. Invariant: Customer can only cancel if status is PENDING_PAYMENT or CONFIRMED
      if (
        order.status !== ORDER_STATUSES.PENDING_PAYMENT &&
        order.status !== ORDER_STATUSES.CONFIRMED
      ) {
        throw new AppError(422, ERROR_CODES.ORDER_CANNOT_CANCEL);
      }

      // 2b. If order has already been PAID online (e.g. VNPay), customer cannot self-cancel
      if (order.paymentStatus === PAYMENT_STATUSES.PAID) {
        throw new AppError(422, ERROR_CODES.ORDER_PAID_CANNOT_CANCEL);
      }

      // 3. Stock release / restitution
      if (order.status === ORDER_STATUSES.PENDING_PAYMENT) {
        // Release reservation
        for (const item of order.items) {
          if (item.variantId) {
            await inventoryService.releaseReservation(
              item.variantId,
              item.quantity,
              order.orderNumber,
              userId,
              tx,
            );
          }
        }
      } else if (order.status === ORDER_STATUSES.CONFIRMED) {
        // Return committed stock to on-hand
        for (const item of order.items) {
          if (item.variantId) {
            const inv = await inventoryRepository.findForUpdate(item.variantId, tx);
            if (inv) {
              const newOnHand = inv.onHand + item.quantity;
              await inventoryRepository.updateStock(inv.id, { onHand: newOnHand }, tx);
              await inventoryRepository.createStockMovement(
                {
                  inventoryId: inv.id,
                  type: 'RESTOCK',
                  onHandChange: item.quantity,
                  reservedChange: 0,
                  balanceAfterOnHand: newOnHand,
                  balanceAfterReserved: inv.reserved,
                  reason: `Stock returned from cancelled confirmed order ${order.orderNumber}`,
                  referenceType: 'ORDER',
                  referenceId: order.orderNumber,
                  actorId: userId,
                },
                tx,
              );
            }
          }
        }
      }

      // 4. If coupon was applied, revert usage count
      if (order.couponCode) {
        const coupon = await couponRepository.findByCode(order.couponCode, tx);
        if (coupon) {
          await tx.coupon.update({
            where: { id: coupon.id },
            data: { usedCount: { decrement: 1 } },
          });
          await tx.couponUsage.deleteMany({
            where: { orderId: order.id },
          });
        }
      }

      // 5. Expire any pending payment attempts
      await tx.paymentTransaction.updateMany({
        where: { orderId: order.id, status: PAYMENT_TRANSACTION_STATUSES.PENDING },
        data: { status: PAYMENT_TRANSACTION_STATUSES.EXPIRED },
      });

      // 6. Update Order Status to CANCELLED
      const cancelReason = dto.reason ?? 'Cancelled by customer';
      const updatedOrder = await orderRepository.updateOrderStatus(
        order.id,
        {
          status: ORDER_STATUSES.CANCELLED,
          cancelReason,
          cancelledAt: new Date(),
        },
        tx,
      );

      // 6. Record Status History
      await orderRepository.createStatusHistory(
        {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: ORDER_STATUSES.CANCELLED,
          reason: cancelReason,
          changedById: userId,
        },
        tx,
      );

      // 7. Record Audit Log
      await auditRepository.createAuditLog(
        {
          actorId: userId,
          action: AUDIT_ACTIONS.ORDER_CANCELLED,
          targetType: 'ORDER',
          targetId: order.id,
          payload: {
            orderNumber: order.orderNumber,
            fromStatus: order.status,
            reason: cancelReason,
          },
        },
        tx,
      );

      return mapOrderToResponse(updatedOrder);
    });
  },

  async listAdminOrders(query: ListAdminOrdersQueryDto) {
    const result = await orderRepository.listAdminOrders({
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      paymentStatus: query.paymentStatus,
      search: query.search,
    });

    return {
      items: result.items.map(mapOrderToResponse),
      total: result.total,
    };
  },

  async getAdminOrderById(orderId: string) {
    const order = await orderRepository.findById(orderId);
    if (!order) {
      throw new AppError(404, ERROR_CODES.ORDER_NOT_FOUND);
    }
    return mapOrderToResponse(order);
  },

  async updateAdminOrderStatus(orderId: string, dto: UpdateOrderStatusDto, actorId: string) {
    return prisma.$transaction(async (tx) => {
      // 1. Lock order for update
      const order = await orderRepository.findForUpdate(orderId, tx);
      if (!order) {
        throw new AppError(404, ERROR_CODES.ORDER_NOT_FOUND);
      }

      // 2. State Machine validation
      const allowedNextStatuses = VALID_TRANSITIONS[order.status] ?? [];
      if (!allowedNextStatuses.includes(dto.status)) {
        throw new AppError(422, ERROR_CODES.ORDER_INVALID_STATE_TRANSITION);
      }

      // 2b. Invariant: Admin cannot manually confirm VNPay orders that are awaiting payment
      if (
        order.paymentMethod === PAYMENT_METHODS.VNPAY &&
        order.status === ORDER_STATUSES.PENDING_PAYMENT &&
        dto.status === ORDER_STATUSES.CONFIRMED
      ) {
        throw new AppError(422, ERROR_CODES.ORDER_VNPAY_ADMIN_CONFIRM_NOT_ALLOWED);
      }

      let nextPaymentStatus: PaymentStatus | undefined;

      // 3. Handle stock transitions
      if (dto.status === ORDER_STATUSES.CANCELLED) {
        if (order.status === ORDER_STATUSES.PENDING_PAYMENT) {
          for (const item of order.items) {
            if (item.variantId) {
              await inventoryService.releaseReservation(
                item.variantId,
                item.quantity,
                order.orderNumber,
                actorId,
                tx,
              );
            }
          }
        } else {
          // If was CONFIRMED, PROCESSING, SHIPPING, restock onHand back
          for (const item of order.items) {
            if (item.variantId) {
              const inv = await inventoryRepository.findForUpdate(item.variantId, tx);
              if (inv) {
                const newOnHand = inv.onHand + item.quantity;
                await inventoryRepository.updateStock(inv.id, { onHand: newOnHand }, tx);
                await inventoryRepository.createStockMovement(
                  {
                    inventoryId: inv.id,
                    type: 'RESTOCK',
                    onHandChange: item.quantity,
                    reservedChange: 0,
                    balanceAfterOnHand: newOnHand,
                    balanceAfterReserved: inv.reserved,
                    reason: `Stock returned from admin-cancelled order ${order.orderNumber}`,
                    referenceType: 'ORDER',
                    referenceId: order.orderNumber,
                    actorId,
                  },
                  tx,
                );
              }
            }
          }
        }

        // Revert coupon if applicable
        if (order.couponCode) {
          const coupon = await couponRepository.findByCode(order.couponCode, tx);
          if (coupon) {
            await tx.coupon.update({
              where: { id: coupon.id },
              data: { usedCount: { decrement: 1 } },
            });
            await tx.couponUsage.deleteMany({
              where: { orderId: order.id },
            });
          }
        }

        // Expire any pending payment attempts
        await tx.paymentTransaction.updateMany({
          where: { orderId: order.id, status: PAYMENT_TRANSACTION_STATUSES.PENDING },
          data: { status: PAYMENT_TRANSACTION_STATUSES.EXPIRED },
        });
      } else if (dto.status === ORDER_STATUSES.PAYMENT_EXPIRED) {
        // Release reservation for expired payment
        for (const item of order.items) {
          if (item.variantId) {
            await inventoryService.releaseReservation(
              item.variantId,
              item.quantity,
              order.orderNumber,
              actorId,
              tx,
            );
          }
        }

        // Revert coupon if applicable
        if (order.couponCode) {
          const coupon = await couponRepository.findByCode(order.couponCode, tx);
          if (coupon) {
            await tx.coupon.update({
              where: { id: coupon.id },
              data: { usedCount: { decrement: 1 } },
            });
            await tx.couponUsage.deleteMany({
              where: { orderId: order.id },
            });
          }
        }

        // Expire any pending payment attempts and mark paymentStatus as EXPIRED
        await tx.paymentTransaction.updateMany({
          where: { orderId: order.id, status: PAYMENT_TRANSACTION_STATUSES.PENDING },
          data: { status: PAYMENT_TRANSACTION_STATUSES.EXPIRED },
        });

        nextPaymentStatus = PAYMENT_STATUSES.EXPIRED;
      } else if (
        dto.status === ORDER_STATUSES.CONFIRMED &&
        order.status === ORDER_STATUSES.PENDING_PAYMENT
      ) {
        // If transitioning from PENDING_PAYMENT to CONFIRMED (for COD)
        for (const item of order.items) {
          if (item.variantId) {
            await inventoryService.commitReservation(
              item.variantId,
              item.quantity,
              order.orderNumber,
              actorId,
              tx,
            );
          }
        }
      }

      // 4. Update PaymentStatus if COD order is DELIVERED
      if (
        dto.status === ORDER_STATUSES.DELIVERED &&
        order.paymentMethod === PAYMENT_METHODS.COD &&
        order.paymentStatus === PAYMENT_STATUSES.PENDING
      ) {
        nextPaymentStatus = PAYMENT_STATUSES.PAID;
      }

      // 5. Update Order Status
      const reason = dto.reason ?? `Status updated to ${dto.status}`;
      const updatedOrder = await orderRepository.updateOrderStatus(
        order.id,
        {
          status: dto.status,
          paymentStatus: nextPaymentStatus,
          cancelReason: dto.status === ORDER_STATUSES.CANCELLED ? reason : undefined,
          cancelledAt: dto.status === ORDER_STATUSES.CANCELLED ? new Date() : undefined,
        },
        tx,
      );

      // 6. Record Status History
      await orderRepository.createStatusHistory(
        {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: dto.status,
          reason,
          changedById: actorId,
        },
        tx,
      );

      // 7. Record Audit Log
      await auditRepository.createAuditLog(
        {
          actorId,
          action: AUDIT_ACTIONS.ORDER_STATUS_UPDATED,
          targetType: 'ORDER',
          targetId: order.id,
          payload: {
            orderNumber: order.orderNumber,
            fromStatus: order.status,
            toStatus: dto.status,
            reason,
          },
        },
        tx,
      );

      return mapOrderToResponse(updatedOrder);
    });
  },
};
