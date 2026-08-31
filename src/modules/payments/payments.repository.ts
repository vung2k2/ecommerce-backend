import { prisma } from '../../database/prisma.js';
import {
  type PaymentMethod,
  type PaymentTransactionStatus,
  type Prisma,
} from '../../generated/prisma/client.js';

type PrismaClientOrTx = Prisma.TransactionClient | typeof prisma;

// ==================== Data Interfaces ====================

export interface CreatePaymentTransactionData {
  orderId: string;
  paymentMethod?: PaymentMethod | undefined;
  txnRef: string;
  bankCode?: string | null | undefined;
  amount: bigint;
  status?: PaymentTransactionStatus | undefined;
  metadata?: Prisma.InputJsonValue | undefined;
}

export interface UpdatePaymentTransactionData {
  status?: PaymentTransactionStatus | undefined;
  bankCode?: string | null | undefined;
  bankTranNo?: string | null | undefined;
  cardType?: string | null | undefined;
  responseCode?: string | null | undefined;
  transactionNo?: string | null | undefined;
  transactionStatus?: string | null | undefined;
  payDate?: Date | null | undefined;
  metadata?: Prisma.InputJsonValue | undefined;
}

export interface PaymentTransactionRecord {
  id: string;
  orderId: string;
  paymentMethod: PaymentMethod;
  txnRef: string;
  bankCode: string | null;
  bankTranNo: string | null;
  cardType: string | null;
  amount: bigint;
  status: PaymentTransactionStatus;
  responseCode: string | null;
  transactionNo: string | null;
  transactionStatus: string | null;
  payDate: Date | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  order?: {
    id: string;
    orderNumber: string;
    userId: string;
    status: string;
    paymentStatus: string;
    totalAmount: bigint;
  } | undefined;
}

// ==================== Repository ====================

export const paymentRepository = {
  async createPaymentTransaction(
    data: CreatePaymentTransactionData,
    tx?: PrismaClientOrTx,
  ): Promise<PaymentTransactionRecord> {
    const client = tx ?? prisma;
    return client.paymentTransaction.create({
      data: {
        orderId: data.orderId,
        paymentMethod: data.paymentMethod ?? 'VNPAY',
        txnRef: data.txnRef,
        bankCode: data.bankCode ?? null,
        amount: data.amount,
        status: data.status ?? 'PENDING',
        ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
      },
    });
  },

  async findByTxnRef(
    txnRef: string,
    tx?: PrismaClientOrTx,
  ): Promise<PaymentTransactionRecord | null> {
    const client = tx ?? prisma;
    return client.paymentTransaction.findUnique({
      where: { txnRef },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            userId: true,
            status: true,
            paymentStatus: true,
            totalAmount: true,
          },
        },
      },
    });
  },

  async updatePaymentTransaction(
    id: string,
    data: UpdatePaymentTransactionData,
    tx?: PrismaClientOrTx,
  ): Promise<PaymentTransactionRecord> {
    const client = tx ?? prisma;
    return client.paymentTransaction.update({
      where: { id },
      data: {
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.bankCode !== undefined ? { bankCode: data.bankCode } : {}),
        ...(data.bankTranNo !== undefined ? { bankTranNo: data.bankTranNo } : {}),
        ...(data.cardType !== undefined ? { cardType: data.cardType } : {}),
        ...(data.responseCode !== undefined ? { responseCode: data.responseCode } : {}),
        ...(data.transactionNo !== undefined ? { transactionNo: data.transactionNo } : {}),
        ...(data.transactionStatus !== undefined
          ? { transactionStatus: data.transactionStatus }
          : {}),
        ...(data.payDate !== undefined ? { payDate: data.payDate } : {}),
        ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
      },
    });
  },

  async listByOrderId(
    orderId: string,
    tx?: PrismaClientOrTx,
  ): Promise<PaymentTransactionRecord[]> {
    const client = tx ?? prisma;
    return client.paymentTransaction.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
  },

  async findActivePendingByOrderId(
    orderId: string,
    tx?: PrismaClientOrTx,
  ): Promise<PaymentTransactionRecord | null> {
    const client = tx ?? prisma;
    return client.paymentTransaction.findFirst({
      where: {
        orderId,
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
    });
  },
};
