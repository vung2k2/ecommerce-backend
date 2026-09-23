import type { RequestHandler } from 'express';
import { sendSuccess } from '../../utils/response.js';
import type { SalesReportQueryDto, TopProductsQueryDto } from './reports.schema.js';
import { reportsService } from './reports.service.js';

export const reportsController = {
  getSalesReport: (async (req, res) => {
    const query = req.query as unknown as SalesReportQueryDto;
    const report = await reportsService.getSalesReport(query);
    return sendSuccess(res, report);
  }) as RequestHandler,

  getTopProductsReport: (async (req, res) => {
    const query = req.query as unknown as TopProductsQueryDto;
    const report = await reportsService.getTopProductsReport(query);
    return sendSuccess(res, report);
  }) as RequestHandler,
};
