import type { RequestHandler } from 'express';
import { resolveLocale } from '../i18n/index.js';

export const resolveRequestLocale: RequestHandler = (req, res, next) => {
  req.locale = resolveLocale(req.headers['accept-language']);
  res.setHeader('Content-Language', req.locale);
  res.vary('Accept-Language');
  next();
};
