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
import { stripeService } from '../../services/stripe.service.js';
import { AppError } from '../../utils/app-error.js';
import { auditRepository } from '../audit/audit.repository.js';
import { inventoryService } from '../inventory/inventory.service.js';
import { orderRepository } from '../orders/orders.repository.js';
import type { PaymentTransactionRecord } from './payments.repository.js';
import { paymentRepository } from './payments.repository.js';
import type { CreateStripeCheckoutDto } from './payments.schema.js';

export const paymentService = {
  async createStripeCheckoutSession(
    userId: string,
    dto: CreateStripeCheckoutDto,
  ): Promise<{ sessionId: string; checkoutUrl: string }> {
    return prisma.$transaction(async (tx) => {
      // 1. Lock order for update to prevent concurrent payment attempts
      const order = await orderRepository.findForUpdate(dto.orderId, tx);
      if (!order || order.userId !== userId) {
        throw new AppError(404, ERROR_CODES.ORDER_NOT_FOUND);
      }

      if (
        order.paymentMethod !== PAYMENT_METHODS.STRIPE ||
        order.status !== ORDER_STATUSES.PENDING_PAYMENT ||
        order.paymentStatus !== PAYMENT_STATUSES.PENDING
      ) {
        throw new AppError(422, ERROR_CODES.PAYMENT_ORDER_NOT_PAYABLE);
      }

      // 2. Check for an existing active PENDING payment attempt to prevent duplicate sessions
      const activePendingTx = await paymentRepository.findActivePendingByOrderId(order.id, tx);
      let txnRef: string;

      if (activePendingTx) {
        const isExpired = Date.now() - activePendingTx.createdAt.getTime() > 15 * 60 * 1000;
        if (!isExpired) {
          txnRef = activePendingTx.txnRef;
        } else {
          await paymentRepository.updatePaymentTransaction(
            activePendingTx.id,
            { status: PAYMENT_TRANSACTION_STATUSES.EXPIRED },
            tx,
          );
          const suffix = randomBytes(4).toString('hex');
          txnRef = `${order.orderNumber}-${suffix}`;
          await paymentRepository.createPaymentTransaction(
            {
              orderId: order.id,
              paymentMethod: PAYMENT_METHODS.STRIPE,
              txnRef,
              amount: order.totalAmount,
              status: PAYMENT_TRANSACTION_STATUSES.PENDING,
            },
            tx,
          );
        }
      } else {
        const suffix = randomBytes(4).toString('hex');
        txnRef = `${order.orderNumber}-${suffix}`;
        await paymentRepository.createPaymentTransaction(
          {
            orderId: order.id,
            paymentMethod: PAYMENT_METHODS.STRIPE,
            txnRef,
            amount: order.totalAmount,
            status: PAYMENT_TRANSACTION_STATUSES.PENDING,
          },
          tx,
        );
      }

      const stripeResult = await stripeService.createCheckoutSession({
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount: order.totalAmount,
        lineItems: order.items.map((item) => ({
          name: item.productName,
          quantity: item.quantity,
          unitAmount: item.unitPrice,
        })),
        metadata: {
          txnRef,
          userId,
        },
      });

      // Save Stripe session ID to transaction
      const txRecord = await paymentRepository.findByTxnRef(txnRef, tx);
      if (txRecord) {
        await paymentRepository.updatePaymentTransaction(
          txRecord.id,
          { transactionNo: stripeResult.sessionId },
          tx,
        );
      }

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

      return stripeResult;
    });
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

        // Active Order success transition: CONFIRMED + PAID
        await orderRepository.updateOrderStatus(
          order.id,
          {
            status: ORDER_STATUSES.CONFIRMED,
            paymentStatus: PAYMENT_STATUSES.PAID,
          },
          tx,
        );

        // Commit stock reservation
        for (const item of order.items) {
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
    } else if (event.type === 'checkout.session.expired') {
      const session = event.data.object;
      const orderId = session.metadata?.orderId;
      const txnRef = session.metadata?.txnRef;

      if (orderId) {
        await prisma.$transaction(async (tx) => {
          const order = await orderRepository.findForUpdate(orderId, tx);
          if (order && order.status === ORDER_STATUSES.PENDING_PAYMENT) {
            await orderRepository.updateOrderStatus(
              order.id,
              {
                status: ORDER_STATUSES.PAYMENT_EXPIRED,
                paymentStatus: PAYMENT_STATUSES.EXPIRED,
              },
              tx,
            );

            for (const item of order.items) {
              if (item.variantId) {
                await inventoryService.releaseReservation(
                  item.variantId,
                  item.quantity,
                  order.orderNumber,
                  null,
                  tx,
                );
              }
            }

            if (txnRef) {
              const paymentTx = await paymentRepository.findByTxnRef(txnRef, tx);
              if (paymentTx) {
                await paymentRepository.updatePaymentTransaction(
                  paymentTx.id,
                  { status: PAYMENT_TRANSACTION_STATUSES.EXPIRED },
                  tx,
                );
              }
            }
          }
        });
      }
    }

    return { received: true };
  },
};
