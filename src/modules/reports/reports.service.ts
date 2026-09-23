import { ERROR_CODES } from '../../constants/index.js';
import { AppError } from '../../utils/app-error.js';
import { reportsRepository } from './reports.repository.js';
import type { SalesReportQueryDto, TopProductsQueryDto } from './reports.schema.js';

export const reportsService = {
  getSalesReport: async (query: SalesReportQueryDto) => {
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (query.startDate) {
      startDate = new Date(query.startDate);
    }
    if (query.endDate) {
      endDate = new Date(query.endDate);
    }

    if (startDate && endDate && startDate > endDate) {
      throw new AppError(400, ERROR_CODES.INVALID_REPORT_DATE_RANGE);
    }

    const data = await reportsRepository.getSalesOverview({ startDate, endDate });

    return {
      totalRevenue: data.totalRevenue.toString(),
      totalOrders: data.totalOrders,
      totalItemsSold: data.totalItemsSold,
      averageOrderValue: data.averageOrderValue.toString(),
      dailyBreakdown: data.dailyBreakdown.map((item) => ({
        date: item.date,
        revenue: item.revenue.toString(),
        ordersCount: item.ordersCount,
      })),
    };
  },

  getTopProductsReport: async (query: TopProductsQueryDto) => {
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (query.startDate) {
      startDate = new Date(query.startDate);
    }
    if (query.endDate) {
      endDate = new Date(query.endDate);
    }

    if (startDate && endDate && startDate > endDate) {
      throw new AppError(400, ERROR_CODES.INVALID_REPORT_DATE_RANGE);
    }

    const products = await reportsRepository.getTopSellingProducts({
      startDate,
      endDate,
      limit: query.limit,
    });

    return {
      products: products.map((p) => ({
        productId: p.productId,
        productName: p.productName,
        unitsSold: p.unitsSold,
        totalRevenue: p.totalRevenue.toString(),
      })),
    };
  },
};
