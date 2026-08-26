import type { ZodIssue } from 'zod';
import { ERROR_CODES, type ErrorCode } from '../constants/index.js';
import { enMessages, type MessageKey } from './locales/en.js';
import { viMessages } from './locales/vi.js';

export const SUPPORTED_LOCALES = ['en', 'vi'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export type TranslationParams = Record<string, string | number>;

const catalogs: Record<Locale, Record<MessageKey, string>> = {
  en: enMessages,
  vi: viMessages,
};

const errorMessageKeys = {
  [ERROR_CODES.UNAUTHORIZED]: 'errors.unauthorized',
  [ERROR_CODES.FORBIDDEN]: 'errors.forbidden',
  [ERROR_CODES.VALIDATION_ERROR]: 'errors.validationError',
  [ERROR_CODES.ROUTE_NOT_FOUND]: 'errors.routeNotFound',
  [ERROR_CODES.TOO_MANY_REQUESTS]: 'errors.tooManyRequests',
  [ERROR_CODES.INTERNAL_SERVER_ERROR]: 'errors.internalServerError',
  [ERROR_CODES.EMAIL_ALREADY_EXISTS]: 'errors.emailAlreadyExists',
  [ERROR_CODES.INVALID_CREDENTIALS]: 'errors.invalidCredentials',
  [ERROR_CODES.INACTIVE_ACCOUNT]: 'errors.inactiveAccount',
  [ERROR_CODES.INVALID_REFRESH_TOKEN]: 'errors.invalidRefreshToken',
  [ERROR_CODES.TOKEN_REUSE_DETECTED]: 'errors.tokenReuseDetected',
  [ERROR_CODES.USER_NOT_FOUND]: 'errors.userNotFound',
  [ERROR_CODES.STAFF_NOT_FOUND]: 'errors.staffNotFound',
  [ERROR_CODES.ADDRESS_NOT_FOUND]: 'errors.addressNotFound',
  [ERROR_CODES.INVALID_TARGET_ROLE]: 'errors.invalidTargetRole',
  [ERROR_CODES.CANNOT_DEACTIVATE_LAST_ADMIN]: 'errors.cannotDeactivateLastAdmin',
  [ERROR_CODES.CATEGORY_NOT_FOUND]: 'errors.categoryNotFound',
  [ERROR_CODES.CATEGORY_SLUG_EXISTS]: 'errors.categorySlugExists',
  [ERROR_CODES.CATEGORY_HAS_CHILDREN]: 'errors.categoryHasChildren',
  [ERROR_CODES.CATEGORY_HAS_PRODUCTS]: 'errors.categoryHasProducts',
  [ERROR_CODES.CATEGORY_CYCLIC_HIERARCHY]: 'errors.categoryCyclicHierarchy',
  [ERROR_CODES.BRAND_NOT_FOUND]: 'errors.brandNotFound',
  [ERROR_CODES.BRAND_SLUG_EXISTS]: 'errors.brandSlugExists',
  [ERROR_CODES.BRAND_HAS_PRODUCTS]: 'errors.brandHasProducts',
  [ERROR_CODES.PRODUCT_NOT_FOUND]: 'errors.productNotFound',
  [ERROR_CODES.PRODUCT_SLUG_EXISTS]: 'errors.productSlugExists',
  [ERROR_CODES.PRODUCT_SKU_EXISTS]: 'errors.productSkuExists',
  [ERROR_CODES.VARIANT_NOT_FOUND]: 'errors.variantNotFound',
  [ERROR_CODES.PRODUCT_IMAGE_NOT_FOUND]: 'errors.productImageNotFound',
  [ERROR_CODES.SPECIFICATION_NOT_FOUND]: 'errors.specNotFound',
  [ERROR_CODES.INVENTORY_NOT_FOUND]: 'errors.inventoryNotFound',
  [ERROR_CODES.INSUFFICIENT_STOCK]: 'errors.insufficientStock',
  [ERROR_CODES.INVALID_STOCK_ADJUSTMENT]: 'errors.invalidStockAdjustment',
  [ERROR_CODES.INVALID_STOCK_OPERATION]: 'errors.invalidStockOperation',
  [ERROR_CODES.STOCK_EVENT_CONFLICT]: 'errors.stockEventConflict',
  [ERROR_CODES.STOCK_HISTORY_EXISTS]: 'errors.stockHistoryExists',
  [ERROR_CODES.INVALID_FILE_TYPE]: 'errors.invalidFileType',
  [ERROR_CODES.FILE_SIZE_EXCEEDED]: 'errors.fileSizeExceeded',
  [ERROR_CODES.FILE_REQUIRED]: 'errors.fileRequired',
} as const satisfies Record<ErrorCode, MessageKey>;

function interpolate(message: string, params: TranslationParams): string {
  return message.replace(/\{(\w+)\}/g, (placeholder: string, name: string) => {
    const value = params[name];
    return value === undefined ? placeholder : String(value);
  });
}

export function resolveLocale(acceptLanguage: string | string[] | undefined): Locale {
  if (!acceptLanguage) return 'en';

  const header = Array.isArray(acceptLanguage) ? acceptLanguage.join(',') : acceptLanguage;
  const candidates = header
    .split(',')
    .map((entry) => {
      const [language = '', ...parameters] = entry.trim().toLowerCase().split(';');
      const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith('q='));
      const quality = qualityParameter ? Number(qualityParameter.trim().slice(2)) : 1;
      return { language: language.split('-')[0], quality: Number.isFinite(quality) ? quality : 0 };
    })
    .sort((left, right) => right.quality - left.quality);

  for (const candidate of candidates) {
    if (candidate.quality <= 0) continue;
    if (candidate.language === 'en' || candidate.language === 'vi') return candidate.language;
  }

  return 'en';
}

export function isMessageKey(value: string): value is MessageKey {
  return Object.prototype.hasOwnProperty.call(enMessages, value);
}

export function translate(
  locale: Locale | undefined,
  key: MessageKey,
  params: TranslationParams = {},
): string {
  return interpolate(catalogs[locale ?? 'en'][key], params);
}

export function translateError(
  locale: Locale | undefined,
  code: ErrorCode,
  params: TranslationParams = {},
): string {
  return translate(locale, errorMessageKeys[code], params);
}

export function translateValidationIssue(locale: Locale | undefined, issue: ZodIssue): string {
  if (isMessageKey(issue.message)) return translate(locale, issue.message);

  switch (issue.code) {
    case 'too_small':
      return translate(locale, 'validation.valueTooSmall');
    case 'too_big':
      return translate(locale, 'validation.valueTooLarge');
    case 'invalid_format':
      return translate(locale, 'validation.invalidFormat');
    default:
      return translate(locale, 'validation.invalidValue');
  }
}

export type { MessageKey } from './locales/en.js';
