import { UPLOAD_PURPOSES, type UploadPurpose } from '../../constants/index.js';

export interface UploadPolicy {
  folder: string;
  allowedMimeTypes: readonly string[];
  maxSizeBytes: number;
}

export const UPLOAD_POLICIES: Record<UploadPurpose, UploadPolicy> = {
  [UPLOAD_PURPOSES.PRODUCT_IMAGE]: {
    folder: 'products',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeBytes: 10 * 1024 * 1024,
  },
  [UPLOAD_PURPOSES.BRAND_LOGO]: {
    folder: 'brands',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeBytes: 5 * 1024 * 1024,
  },
  [UPLOAD_PURPOSES.USER_AVATAR]: {
    folder: 'avatars',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeBytes: 2 * 1024 * 1024,
  },
};

export const MIME_EXTENSION_MAP = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
} as const satisfies Record<string, string>;
