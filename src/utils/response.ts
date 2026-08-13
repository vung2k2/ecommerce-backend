import type { Response } from 'express';
import { buildPaginatedResponse } from './pagination.js';

/**
 * Trả về response thành công chuẩn hóa dạng { data: ... }
 */
export function sendSuccess<T>(res: Response, data: T, statusCode = 200) {
  return res.status(statusCode).json({ data });
}

/**
 * Trả về response thành công dạng danh sách có phân trang chuẩn hóa dạng { data: [...], meta: { page, pageSize, total, totalPages } }
 */
export function sendPaginated<T>(
  res: Response,
  data: T[],
  total: number,
  query: { page: number; pageSize: number },
  statusCode = 200,
) {
  return res.status(statusCode).json(buildPaginatedResponse(data, total, query));
}
