import crypto from 'node:crypto';
import { env } from '../config/env.js';

export interface BuildPaymentUrlInput {
  orderId: string;
  orderNumber: string;
  amount: bigint; // Total VND (without multiplying by 100)
  clientIp: string;
  txnRef: string;
  bankCode?: string | undefined;
  language?: 'vn' | 'en' | undefined;
  orderInfo?: string | undefined;
}

export function formatVnPayDate(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');
  const hour = getPart('hour');
  const minute = getPart('minute');
  const second = getPart('second');
  return `${year}${month}${day}${hour}${minute}${second}`;
}

export function parseVnPayDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.length !== 14) {
    return null;
  }
  const year = Number.parseInt(dateStr.slice(0, 4), 10);
  const month = Number.parseInt(dateStr.slice(4, 6), 10) - 1;
  const day = Number.parseInt(dateStr.slice(6, 8), 10);
  const hour = Number.parseInt(dateStr.slice(8, 10), 10);
  const minute = Number.parseInt(dateStr.slice(10, 12), 10);
  const second = Number.parseInt(dateStr.slice(12, 14), 10);

  // VNPay returns time in GMT+7. We construct Date as UTC by subtracting 7 hours.
  const utcDate = new Date(Date.UTC(year, month, day, hour - 7, minute, second));
  return Number.isNaN(utcDate.getTime()) ? null : utcDate;
}

export function sortObject(obj: Record<string, string>): Record<string, string> {
  const sorted: Record<string, string> = {};
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined && obj[k] !== null && obj[k] !== '')
    .sort();

  for (const key of keys) {
    const val = obj[key];
    if (val !== undefined) {
      sorted[key] = encodeURIComponent(val).replace(/%20/g, '+');
    }
  }

  return sorted;
}

export const vnpayService = {
  buildPaymentUrl(input: BuildPaymentUrlInput): string {
    const now = new Date();
    const createDate = formatVnPayDate(now);
    // Expire after 15 minutes
    const expireDate = formatVnPayDate(new Date(now.getTime() + 15 * 60 * 1000));

    // Client IP formatting (fallback to 127.0.0.1 for IPv6 localhost)
    let ipAddr = input.clientIp || '127.0.0.1';
    if (ipAddr === '::1' || ipAddr === '::ffff:127.0.0.1') {
      ipAddr = '127.0.0.1';
    }

    const vnpParams: Record<string, string> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: env.VNPAY_TMN_CODE,
      vnp_Locale: input.language ?? 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: input.txnRef,
      vnp_OrderInfo: input.orderInfo ?? `Thanh toan don hang ${input.orderNumber}`,
      vnp_OrderType: 'other',
      vnp_Amount: (input.amount * 100n).toString(),
      vnp_ReturnUrl: env.VNPAY_RETURN_URL,
      vnp_IpAddr: ipAddr,
      vnp_CreateDate: createDate,
      vnp_ExpireDate: expireDate,
    };

    if (input.bankCode) {
      vnpParams.vnp_BankCode = input.bankCode;
    }

    const sortedParams = sortObject(vnpParams);

    const signData = Object.entries(sortedParams)
      .map(([k, v]) => `${k}=${v}`)
      .join('&');

    const hmac = crypto.createHmac('sha512', env.VNPAY_HASH_SECRET);
    const secureHash = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    sortedParams.vnp_SecureHash = secureHash;

    const queryString = Object.entries(sortedParams)
      .map(([k, v]) => `${k}=${v}`)
      .join('&');

    return `${env.VNPAY_PAY_URL}?${queryString}`;
  },

  verifyChecksum(rawQuery: Record<string, unknown>): boolean {
    const secureHash = rawQuery.vnp_SecureHash;
    if (!secureHash || typeof secureHash !== 'string') {
      return false;
    }

    const vnpParams: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawQuery)) {
      if (key.startsWith('vnp_') && key !== 'vnp_SecureHash' && key !== 'vnp_SecureHashType') {
        if (typeof value === 'string' && value.length > 0) {
          vnpParams[key] = value;
        } else if (typeof value === 'number' || typeof value === 'bigint') {
          vnpParams[key] = value.toString();
        }
      }
    }

    const sortedParams = sortObject(vnpParams);
    const signData = Object.entries(sortedParams)
      .map(([k, v]) => `${k}=${v}`)
      .join('&');

    const hmac = crypto.createHmac('sha512', env.VNPAY_HASH_SECRET);
    const calculatedHash = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    if (secureHash.length !== calculatedHash.length) {
      return false;
    }

    try {
      return crypto.timingSafeEqual(
        Buffer.from(secureHash, 'hex'),
        Buffer.from(calculatedHash, 'hex'),
      );
    } catch {
      return false;
    }
  },
};
