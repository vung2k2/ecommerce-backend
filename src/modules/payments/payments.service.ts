import { randomBytes } from 'node:crypto';
import { env } from '../../config/env.js';
import {
  AUDIT_ACTIONS,
  ERROR_CODES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PAYMENT_TRANSACTION_STATUSES,
} from '../../constants/index.js';
import { prisma } from '../../database/prisma.js';
import { parseVnPayDate, vnpayService } from '../../services/vnpay.service.js';
import { AppError } from '../../utils/app-error.js';
import { auditRepository } from '../audit/audit.repository.js';
import { inventoryService } from '../inventory/inventory.service.js';
import { orderRepository } from '../orders/orders.repository.js';
import type { PaymentTransactionRecord } from './payments.repository.js';
import { paymentRepository } from './payments.repository.js';
import type { CreatePaymentUrlDto, VnPayReturnQueryDto } from './payments.schema.js';

export interface VnPayIpnResult {
  RspCode: string;
  Message: string;
}

export interface VnPayReturnResult {
  isSuccess: boolean;
  orderNumber: string | null;
  responseCode: string;
  transactionNo: string | null;
  amount: string;
  message: string;
}

function getStringParam(val: unknown): string {
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'bigint') return val.toString();
  return '';
}

function getOptionalStringParam(val: unknown): string | null {
  if (typeof val === 'string' && val.length > 0) return val;
  if (typeof val === 'number' || typeof val === 'bigint') return val.toString();
  return null;
}

export const paymentService = {
  async createPaymentUrl(
    userId: string,
    dto: CreatePaymentUrlDto,
    clientIp: string,
  ): Promise<{ paymentUrl: string; txnRef: string }> {
    return prisma.$transaction(async (tx) => {
      // 1. Lock order for update to prevent concurrent payment attempts
      const order = await orderRepository.findForUpdate(dto.orderId, tx);
      if (!order || order.userId !== userId) {
        throw new AppError(404, ERROR_CODES.ORDER_NOT_FOUND);
      }

      if (
        order.paymentMethod !== PAYMENT_METHODS.VNPAY ||
        order.status !== ORDER_STATUSES.PENDING_PAYMENT ||
        order.paymentStatus !== PAYMENT_STATUSES.PENDING
      ) {
        throw new AppError(422, ERROR_CODES.PAYMENT_ORDER_NOT_PAYABLE);
      }

      // 2. Check for an existing active PENDING payment attempt to prevent multiple payments
      const activePendingTx = await paymentRepository.findActivePendingByOrderId(order.id, tx);
      let txnRef: string;

      if (activePendingTx) {
        const isExpired = Date.now() - activePendingTx.createdAt.getTime() > 15 * 60 * 1000;
        if (!isExpired) {
          // Reuse active attempt
          txnRef = activePendingTx.txnRef;
        } else {
          // Mark expired and create a new attempt
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
              paymentMethod: PAYMENT_METHODS.VNPAY,
              txnRef,
              bankCode: dto.bankCode ?? null,
              amount: order.totalAmount,
              status: PAYMENT_TRANSACTION_STATUSES.PENDING,
            },
            tx,
          );
        }
      } else {
        // Create new attempt
        const suffix = randomBytes(4).toString('hex');
        txnRef = `${order.orderNumber}-${suffix}`;
        await paymentRepository.createPaymentTransaction(
          {
            orderId: order.id,
            paymentMethod: PAYMENT_METHODS.VNPAY,
            txnRef,
            bankCode: dto.bankCode ?? null,
            amount: order.totalAmount,
            status: PAYMENT_TRANSACTION_STATUSES.PENDING,
          },
          tx,
        );
      }

      const paymentUrl = vnpayService.buildPaymentUrl({
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount: order.totalAmount,
        clientIp,
        txnRef,
        bankCode: dto.bankCode,
        language: dto.language,
      });

      await auditRepository.createAuditLog(
        {
          actorId: userId,
          action: AUDIT_ACTIONS.PAYMENT_URL_CREATED,
          targetType: 'Order',
          targetId: order.id,
          payload: { txnRef, amount: order.totalAmount.toString() },
        },
        tx,
      );

      return { paymentUrl, txnRef };
    });
  },

  async processReturnUrl(query: VnPayReturnQueryDto): Promise<VnPayReturnResult> {
    const isValidChecksum = vnpayService.verifyChecksum(query as Record<string, unknown>);
    const tmnCode = query.vnp_TmnCode ?? '';
    const responseCode = query.vnp_ResponseCode ?? '97';
    const txnRef = query.vnp_TxnRef ?? '';
    const transactionNo = query.vnp_TransactionNo ?? null;

    let amountVnd = '0';
    let orderNumber: string | null = null;

    let transaction: PaymentTransactionRecord | null = null;
    if (txnRef) {
      transaction = await paymentRepository.findByTxnRef(txnRef);
      if (transaction?.order) {
        orderNumber = transaction.order.orderNumber;
      }
    }

    if (!isValidChecksum) {
      return {
        isSuccess: false,
        orderNumber,
        responseCode: '97',
        transactionNo,
        amount: amountVnd,
        message: 'Invalid payment signature',
      };
    }

    if (tmnCode !== env.VNPAY_TMN_CODE) {
      return {
        isSuccess: false,
        orderNumber,
        responseCode: '97',
        transactionNo,
        amount: amountVnd,
        message: 'Invalid merchant code',
      };
    }

    if (!transaction) {
      return {
        isSuccess: false,
        orderNumber: null,
        responseCode: '01',
        transactionNo,
        amount: amountVnd,
        message: 'Payment transaction not found',
      };
    }

    amountVnd = transaction.amount.toString();

    // Verify amount matches
    try {
      const vnpAmount = BigInt(query.vnp_Amount || '0');
      if (vnpAmount !== transaction.amount * 100n) {
        return {
          isSuccess: false,
          orderNumber,
          responseCode: '04',
          transactionNo,
          amount: amountVnd,
          message: 'Invalid payment amount',
        };
      }
    } catch {
      return {
        isSuccess: false,
        orderNumber,
        responseCode: '04',
        transactionNo,
        amount: amountVnd,
        message: 'Invalid payment amount format',
      };
    }

    const isSuccess = responseCode === '00' && query.vnp_TransactionStatus === '00';

    return {
      isSuccess,
      orderNumber,
      responseCode,
      transactionNo,
      amount: amountVnd,
      message: isSuccess
        ? 'Payment authorized successfully'
        : `Payment failed with code ${responseCode}`,
    };
  },

  async processIpn(query: Record<string, unknown>): Promise<VnPayIpnResult> {
    // 1. Verify Checksum
    const isValidChecksum = vnpayService.verifyChecksum(query);
    if (!isValidChecksum) {
      return { RspCode: '97', Message: 'Invalid Checksum' };
    }

    // 2. Verify Merchant Code
    const tmnCode = getStringParam(query.vnp_TmnCode);
    if (tmnCode !== env.VNPAY_TMN_CODE) {
      return { RspCode: '97', Message: 'Invalid Merchant' };
    }

    const txnRef = getStringParam(query.vnp_TxnRef);
    const responseCode = getStringParam(query.vnp_ResponseCode);
    const transactionStatus = getStringParam(query.vnp_TransactionStatus);
    const bankCode = getOptionalStringParam(query.vnp_BankCode);
    const bankTranNo = getOptionalStringParam(query.vnp_BankTranNo);
    const cardType = getOptionalStringParam(query.vnp_CardType);
    const transactionNo = getOptionalStringParam(query.vnp_TransactionNo);
    const payDateRaw = getStringParam(query.vnp_PayDate);
    const payDate = payDateRaw ? parseVnPayDate(payDateRaw) : null;

    let vnpAmount = 0n;
    try {
      const amountStr = getStringParam(query.vnp_Amount);
      vnpAmount = BigInt(amountStr || '0');
    } catch {
      return { RspCode: '04', Message: 'Invalid amount' };
    }

    // Execute within database transaction with row lock
    return prisma.$transaction(async (tx) => {
      // 3. Find PaymentTransaction & Order
      const paymentTx = await paymentRepository.findByTxnRef(txnRef, tx);
      if (!paymentTx) {
        return { RspCode: '01', Message: 'Order not found' };
      }

      const order = await orderRepository.findForUpdate(paymentTx.orderId, tx);
      if (!order) {
        return { RspCode: '01', Message: 'Order not found' };
      }

      // 4. Amount Check (vnp_Amount is multiplied by 100)
      const expectedAmount = order.totalAmount * 100n;
      if (vnpAmount !== expectedAmount) {
        return { RspCode: '04', Message: 'Invalid amount' };
      }

      // 5. Idempotency Check
      if (
        order.paymentStatus === PAYMENT_STATUSES.PAID ||
        order.status === ORDER_STATUSES.CONFIRMED ||
        order.status === ORDER_STATUSES.PROCESSING ||
        order.status === ORDER_STATUSES.SHIPPING ||
        order.status === ORDER_STATUSES.DELIVERED
      ) {
        return { RspCode: '02', Message: 'Order already confirmed' };
      }

      // 6. Strict Success Condition: Both responseCode and transactionStatus must be '00'
      const isSuccess = responseCode === '00' && transactionStatus === '00';

      // 7. Handling IPN on terminated order (CANCELLED or PAYMENT_EXPIRED)
      if (
        order.status === ORDER_STATUSES.CANCELLED ||
        order.status === ORDER_STATUSES.PAYMENT_EXPIRED
      ) {
        if (isSuccess) {
          // Customer paid successfully on gateway but order was cancelled before callback:
          // Record transaction as SUCCESS with flagged reconciliation metadata
          await paymentRepository.updatePaymentTransaction(
            paymentTx.id,
            {
              status: PAYMENT_TRANSACTION_STATUSES.SUCCESS,
              bankCode,
              bankTranNo,
              cardType,
              responseCode,
              transactionNo,
              transactionStatus,
              payDate,
              metadata: {
                reconciliationRequired: true,
                note: `VNPay success callback received after order was ${order.status}`,
              },
            },
            tx,
          );

          await auditRepository.createAuditLog(
            {
              actorId: null,
              action: AUDIT_ACTIONS.PAYMENT_IPN_POST_TERMINATION_RECONCILIATION,
              targetType: 'Order',
              targetId: order.id,
              payload: {
                txnRef,
                orderStatus: order.status,
                responseCode,
                transactionNo,
                amount: order.totalAmount.toString(),
                bankCode,
                note: 'Customer charged on gateway after order termination. Requires manual refund.',
              },
            },
            tx,
          );

          return {
            RspCode: '02',
            Message: 'Order already terminated - flagged for reconciliation',
          };
        }

        // Gateway reported failure on already cancelled order
        await paymentRepository.updatePaymentTransaction(
          paymentTx.id,
          {
            status: PAYMENT_TRANSACTION_STATUSES.FAILED,
            bankCode,
            bankTranNo,
            cardType,
            responseCode,
            transactionNo,
            transactionStatus,
            metadata: { note: 'Callback received after order termination' },
          },
          tx,
        );

        await auditRepository.createAuditLog(
          {
            actorId: null,
            action: AUDIT_ACTIONS.PAYMENT_IPN_FAILED,
            targetType: 'Order',
            targetId: order.id,
            payload: {
              txnRef,
              orderStatus: order.status,
              responseCode,
              note: 'VNPay callback on cancelled order',
            },
          },
          tx,
        );

        return { RspCode: '02', Message: 'Order already cancelled' };
      }

      // 8. Handle Payment Success for Active Order
      if (isSuccess) {
        // Update Order: CONFIRMED + PAID
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
        await paymentRepository.updatePaymentTransaction(
          paymentTx.id,
          {
            status: PAYMENT_TRANSACTION_STATUSES.SUCCESS,
            bankCode,
            bankTranNo,
            cardType,
            responseCode,
            transactionNo,
            transactionStatus,
            payDate,
          },
          tx,
        );

        // Order Status History
        await orderRepository.createStatusHistory(
          {
            orderId: order.id,
            fromStatus: ORDER_STATUSES.PENDING_PAYMENT,
            toStatus: ORDER_STATUSES.CONFIRMED,
            reason: `VNPay payment successful (TxnNo: ${transactionNo || 'N/A'})`,
            changedById: null,
          },
          tx,
        );

        // Audit Log
        await auditRepository.createAuditLog(
          {
            actorId: null,
            action: AUDIT_ACTIONS.PAYMENT_IPN_PROCESSED,
            targetType: 'Order',
            targetId: order.id,
            payload: {
              txnRef,
              amount: order.totalAmount.toString(),
              transactionNo,
              bankCode,
            },
          },
          tx,
        );

        return { RspCode: '00', Message: 'Confirm Success' };
      }

      // 9. Handle Payment Failure on VNPay Gateway
      await paymentRepository.updatePaymentTransaction(
        paymentTx.id,
        {
          status: PAYMENT_TRANSACTION_STATUSES.FAILED,
          bankCode,
          bankTranNo,
          cardType,
          responseCode,
          transactionNo,
          transactionStatus,
        },
        tx,
      );

      await auditRepository.createAuditLog(
        {
          actorId: null,
          action: AUDIT_ACTIONS.PAYMENT_IPN_FAILED,
          targetType: 'Order',
          targetId: order.id,
          payload: {
            txnRef,
            responseCode,
            transactionStatus,
          },
        },
        tx,
      );

      return { RspCode: '00', Message: 'Confirm Success' };
    });
  },
};
