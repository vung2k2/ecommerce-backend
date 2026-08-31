import type { RequestHandler } from 'express';
import { sendSuccess } from '../../utils/response.js';
import type { CreatePaymentUrlDto, VnPayReturnQueryDto } from './payments.schema.js';
import { paymentService } from './payments.service.js';

export const paymentController = {
  createPaymentUrl: (async (req, res) => {
    const userId = req.user.userId;
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
    const result = await paymentService.createPaymentUrl(userId, req.body, clientIp);
    return sendSuccess(res, result, 201);
  }) as RequestHandler<unknown, unknown, CreatePaymentUrlDto>,

  processReturnUrl: (async (req, res) => {
    const query = req.query as unknown as VnPayReturnQueryDto;
    const result = await paymentService.processReturnUrl(query);
    return sendSuccess(res, result);
  }) as RequestHandler,

  processIpn: (async (req, res) => {
    const ipnResult = await paymentService.processIpn(req.query as Record<string, unknown>);
    // VNPay IPN requires direct JSON response with RspCode & Message
    return res.status(200).json(ipnResult);
  }) as RequestHandler,
};
