import { describe, expect, it } from 'vitest';
import {
  formatVnPayDate,
  parseVnPayDate,
  sortObject,
  vnpayService,
} from '../src/services/vnpay.service.js';

describe('VNPay Service Unit Tests', () => {
  describe('formatVnPayDate', () => {
    it('formats a date to YYYYMMDDHHmmss in Asia/Ho_Chi_Minh timezone (GMT+7)', () => {
      // 2026-08-31T03:30:15.000Z in UTC is 2026-08-31 10:30:15 in GMT+7
      const utcDate = new Date('2026-08-31T03:30:15.000Z');
      const formatted = formatVnPayDate(utcDate);

      expect(formatted).toBe('20260831103015');
      expect(formatted).toHaveLength(14);
    });
  });

  describe('parseVnPayDate', () => {
    it('parses YYYYMMDDHHmmss from GMT+7 to UTC Date', () => {
      const parsed = parseVnPayDate('20260831103015');
      expect(parsed).not.toBeNull();
      expect(parsed?.toISOString()).toBe('2026-08-31T03:30:15.000Z');
    });

    it('returns null for invalid date strings', () => {
      expect(parseVnPayDate('')).toBeNull();
      expect(parseVnPayDate('20260831')).toBeNull();
      expect(parseVnPayDate('invalid-date-string')).toBeNull();
    });
  });

  describe('sortObject', () => {
    it('sorts keys alphabetically and strips empty/null/undefined values', () => {
      const input: Record<string, string> = {
        vnp_TxnRef: '12345',
        vnp_Amount: '1000000',
        vnp_Command: 'pay',
        vnp_Version: '2.1.0',
        emptyField: '',
      };

      const sorted = sortObject(input);
      const keys = Object.keys(sorted);

      expect(keys).toEqual([
        'vnp_Amount',
        'vnp_Command',
        'vnp_TxnRef',
        'vnp_Version',
      ]);
      expect(sorted['emptyField']).toBeUndefined();
    });

    it('replaces spaces with + encoding', () => {
      const input = {
        vnp_OrderInfo: 'Thanh toan don hang ORD 123',
      };
      const sorted = sortObject(input);
      expect(sorted['vnp_OrderInfo']).toBe('Thanh+toan+don+hang+ORD+123');
    });
  });

  describe('buildPaymentUrl and verifyChecksum', () => {
    it('builds a valid VNPay payment URL and verifies its signature', () => {
      const paymentUrl = vnpayService.buildPaymentUrl({
        orderId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        orderNumber: 'ORD-20260831-ABCDE',
        amount: 500000n, // 500,000 VND
        clientIp: '127.0.0.1',
        txnRef: 'ORD-20260831-ABCDE-1234',
        bankCode: 'NCB',
        language: 'vn',
      });

      expect(paymentUrl).toContain('https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?');
      expect(paymentUrl).toContain('vnp_Amount=50000000'); // Multiplied by 100
      expect(paymentUrl).toContain('vnp_TxnRef=ORD-20260831-ABCDE-1234');
      expect(paymentUrl).toContain('vnp_SecureHash=');

      // Extract query params from generated URL
      const urlObj = new URL(paymentUrl);
      const queryParams: Record<string, string> = {};
      urlObj.searchParams.forEach((value, key) => {
        queryParams[key] = value;
      });

      // Verify checksum on valid URL params
      const isValid = vnpayService.verifyChecksum(queryParams);
      expect(isValid).toBe(true);

      // Verify tampering amount fails checksum
      const tamperedParams = { ...queryParams, vnp_Amount: '100000' };
      expect(vnpayService.verifyChecksum(tamperedParams)).toBe(false);

      // Verify tampering hash fails
      const invalidHashParams = { ...queryParams, vnp_SecureHash: 'invalid_hash_value' };
      expect(vnpayService.verifyChecksum(invalidHashParams)).toBe(false);
    });
  });
});
