import { randomBytes } from 'node:crypto';
import { logger } from '../../config/logger.js';
import {
  AUDIT_ACTIONS,
  ERROR_CODES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PAYMENT_TRANSACTION_STATUSES,
} from '../../constants/index.js';
import { prisma } from '../../database/prisma.js';
import { cancelOrderExpiryJob } from '../../jobs/index.js';
import { stripeService } from '../../services/stripe.service.js';
import { AppError } from '../../utils/app-error.js';
import { sortByVariantId } from '../../utils/lock-order.js';
import { auditRepository } from '../audit/audit.repository.js';
import { inventoryService } from '../inventory/inventory.service.js';
import { orderRepository } from '../orders/orders.repository.js';
import { orderService } from '../orders/orders.service.js';
import type { PaymentTransactionRecord } from './payments.repository.js';
import { paymentRepository } from './payments.repository.js';
import type { CreateStripeCheckoutDto } from './payments.schema.js';


export const paymentService = {
  async createStripeCheckoutSession(
    userId: string,
    dto: CreateStripeCheckoutDto,
  ): Promise<{ sessionId: string; checkoutUrl: string }> {
    // 1. Transaction ngắn: lock order, validate và chốt txnRef. Không gọi Stripe trong transaction
    //    để không giữ row lock trong lúc chờ network và không tạo session mồ côi khi rollback.
    const { order, txnRef } = await prisma.$transaction(async (tx) => {
      const lockedOrder = await orderRepository.findForUpdate(dto.orderId, tx);
      if (!lockedOrder || lockedOrder.userId !== userId) {
        throw new AppError(404, ERROR_CODES.ORDER_NOT_FOUND);
      }

      if (
        lockedOrder.paymentMethod !== PAYMENT_METHODS.STRIPE ||
        lockedOrder.status !== ORDER_STATUSES.PENDING_PAYMENT ||
        lockedOrder.paymentStatus !== PAYMENT_STATUSES.PENDING
      ) {
        throw new AppError(422, ERROR_CODES.PAYMENT_ORDER_NOT_PAYABLE);
      }

      // Tái sử dụng attempt PENDING hiện có: cùng txnRef → cùng idempotency key → Stripe trả lại
      // cùng session, tránh việc có 2 session cùng thanh toán được cho một đơn.
      const activePendingTx = await paymentRepository.findActivePendingByOrderId(
        lockedOrder.id,
        tx,
      );
      if (activePendingTx) {
        const isExpired = Date.now() - activePendingTx.createdAt.getTime() > 15 * 60 * 1000;
        if (!isExpired) {
          return { order: lockedOrder, txnRef: activePendingTx.txnRef };
        }
        await paymentRepository.updatePaymentTransaction(
          activePendingTx.id,
          { status: PAYMENT_TRANSACTION_STATUSES.EXPIRED },
          tx,
        );
      }

      const newTxnRef = `${lockedOrder.orderNumber}-${randomBytes(4).toString('hex')}`;
      await paymentRepository.createPaymentTransaction(
        {
          orderId: lockedOrder.id,
          paymentMethod: PAYMENT_METHODS.STRIPE,
          txnRef: newTxnRef,
          amount: lockedOrder.totalAmount,
          status: PAYMENT_TRANSACTION_STATUSES.PENDING,
        },
        tx,
      );

      return { order: lockedOrder, txnRef: newTxnRef };
    });

    // 2. Gọi Stripe ngoài transaction, idempotent theo txnRef.
    const stripeResult = await stripeService.createCheckoutSession({
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount: order.totalAmount,
      idempotencyKey: `checkout-session:${txnRef}`,
      metadata: {
        txnRef,
        userId,
      },
    });

    // 3. Lưu session ID và audit log lần đầu session được gắn vào attempt.
    await prisma.$transaction(async (tx) => {
      const txRecord = await paymentRepository.findByTxnRef(txnRef, tx);
      if (!txRecord || txRecord.transactionNo === stripeResult.sessionId) {
        return;
      }

      await paymentRepository.updatePaymentTransaction(
        txRecord.id,
        { transactionNo: stripeResult.sessionId },
        tx,
      );

      await auditRepository.createAuditLog(
        {
          actorId: userId,
          action: AUDIT_ACTIONS.CHECKOUT_SESSION_CREATED,
          targetType: 'Order',
          targetId: order.id,
          payload: {
            txnRef,
            sessionId: stripeResult.sessionId,
            amount: order.totalAmount.toString(),
          },
        },
        tx,
      );
    });

    return stripeResult;
  },

  async handleStripeWebhook(
    rawBody: Buffer | string,
    signature: string,
  ): Promise<{ received: boolean }> {
    const event = stripeService.constructWebhookEvent(rawBody, signature);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const txnRef = session.metadata?.txnRef;
      const metadataOrderId = session.metadata?.orderId;

      await prisma.$transaction(async (tx) => {
        let paymentTx: PaymentTransactionRecord | null = null;
        if (txnRef) {
          paymentTx = await paymentRepository.findByTxnRef(txnRef, tx);
        } else if (session.id) {
          paymentTx = await paymentRepository.findByTransactionNo(session.id, tx);
        }

        const orderId = paymentTx?.orderId ?? metadataOrderId;
        if (!orderId) {
          logger.warn(
            { sessionId: session.id },
            'Stripe webhook: No associated orderId or txnRef found',
          );
          return;
        }

        const order = await orderRepository.findForUpdate(orderId, tx);
        if (!order) {
          logger.warn({ orderId }, 'Stripe webhook: Order not found in database');
          return;
        }

        // Idempotency check: If order is already confirmed / paid
        if (
          order.paymentStatus === PAYMENT_STATUSES.PAID ||
          order.status === ORDER_STATUSES.CONFIRMED ||
          order.status === ORDER_STATUSES.PROCESSING ||
          order.status === ORDER_STATUSES.SHIPPING ||
          order.status === ORDER_STATUSES.DELIVERED
        ) {
          return;
        }

        // Exception check: Order was cancelled or payment expired before callback arrived
        if (
          order.status === ORDER_STATUSES.CANCELLED ||
          order.status === ORDER_STATUSES.PAYMENT_EXPIRED
        ) {
          if (paymentTx) {
            await paymentRepository.updatePaymentTransaction(
              paymentTx.id,
              {
                status: PAYMENT_TRANSACTION_STATUSES.SUCCESS,
                transactionNo: session.id,
                metadata: {
                  reconciliationRequired: true,
                  note: `Stripe checkout completed after order was ${order.status}`,
                },
              },
              tx,
            );
          }
          await auditRepository.createAuditLog(
            {
              actorId: null,
              action: AUDIT_ACTIONS.PAYMENT_WEBHOOK_POST_TERMINATION_RECONCILIATION,
              targetType: 'Order',
              targetId: order.id,
              payload: {
                sessionId: session.id,
                orderStatus: order.status,
                reconciliationRequired: true,
              },
            },
            tx,
          );
          return;
        }

        // Defense-in-depth: chỉ xác nhận khi Stripe thực thu đúng số tiền/currency của đơn.
        const isAmountMatched =
          session.amount_total !== null &&
          session.amount_total !== undefined &&
          BigInt(session.amount_total) === order.totalAmount;
        if (session.payment_status !== 'paid' || session.currency !== 'vnd' || !isAmountMatched) {
          logger.warn(
            {
              orderId: order.id,
              sessionId: session.id,
              paymentStatus: session.payment_status,
              currency: session.currency,
              amountTotal: session.amount_total,
              expectedAmount: order.totalAmount.toString(),
            },
            'Stripe webhook: payment status/amount mismatch, order not confirmed',
          );
          if (paymentTx) {
            await paymentRepository.updatePaymentTransaction(
              paymentTx.id,
              {
                transactionNo: session.id,
                metadata: {
                  reconciliationRequired: true,
                  note: 'Stripe session status/amount does not match order',
                },
              },
              tx,
            );
          }
          await auditRepository.createAuditLog(
            {
              actorId: null,
              action: AUDIT_ACTIONS.PAYMENT_WEBHOOK_FAILED,
              targetType: 'Order',
              targetId: order.id,
              payload: {
                sessionId: session.id,
                paymentStatus: session.payment_status,
                currency: session.currency,
                amountTotal: session.amount_total ?? null,
                expectedAmount: order.totalAmount.toString(),
                reconciliationRequired: true,
              },
            },
            tx,
          );
          return;
        }

        // Active Order success transition: CONFIRMED + PAID
        await orderRepository.updateOrderStatus(
          order.id,
          {
            status: ORDER_STATUSES.CONFIRMED,
            paymentStatus: PAYMENT_STATUSES.PAID,
          },
          tx,
        );

        // Commit stock reservation (lock theo thứ tự variantId để tránh deadlock)
        for (const item of sortByVariantId(order.items)) {
          if (item.variantId) {
            await inventoryService.commitReservation(
              item.variantId,
              item.quantity,
              order.orderNumber,
              null,
              tx,
            );
          }
        }

        // Update Payment Transaction to SUCCESS
        if (paymentTx) {
          await paymentRepository.updatePaymentTransaction(
            paymentTx.id,
            {
              status: PAYMENT_TRANSACTION_STATUSES.SUCCESS,
              transactionNo: session.id,
              responseCode: '00',
              transactionStatus: 'paid',
              payDate: new Date(),
            },
            tx,
          );
        }

        // Order Status History
        await orderRepository.createStatusHistory(
          {
            orderId: order.id,
            fromStatus: ORDER_STATUSES.PENDING_PAYMENT,
            toStatus: ORDER_STATUSES.CONFIRMED,
            reason: `Stripe payment successful (Session: ${session.id})`,
            changedById: null,
          },
          tx,
        );

        // Audit Log
        await auditRepository.createAuditLog(
          {
            actorId: null,
            action: AUDIT_ACTIONS.PAYMENT_WEBHOOK_PROCESSED,
            targetType: 'Order',
            targetId: order.id,
            payload: {
              sessionId: session.id,
              txnRef,
              amount: order.totalAmount.toString(),
            },
          },
          tx,
        );
      });

      if (metadataOrderId) {
        await cancelOrderExpiryJob(metadataOrderId);
      }
    } else if (event.type === 'checkout.session.expired') {
      const session = event.data.object;
      const orderId = session.metadata?.orderId;

      if (orderId) {
        await orderService.expireOrder(
          orderId,
          `Stripe checkout session expired (Session: ${session.id})`,
        );
        await cancelOrderExpiryJob(orderId);
      }
    }

    return { received: true };
  },
};
