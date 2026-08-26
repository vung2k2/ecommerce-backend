import { z } from '../../utils/zod.js';
import { registry } from '../../docs/registry.js';

// ==================== Category Schemas ====================

export const categoryIdParamSchema = z.object({
  id: z
    .string()
    .uuid('validation.invalidValue')
    .openapi({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
});
registry.register('CategoryIdParamDto', categoryIdParamSchema);

export const categorySlugParamSchema = z.object({
  slug: z.string().trim().min(1).max(100).openapi({ example: 'laptop-gaming' }),
});
registry.register('CategorySlugParamDto', categorySlugParamSchema);

export const createCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'validation.categoryNameRequired')
    .max(100)
    .openapi({ example: 'Laptop Gaming' }),
  slug: z.string().trim().min(1).max(100).optional().openapi({ example: 'laptop-gaming' }),
  description: z
    .string()
    .trim()
    .optional()
    .openapi({ example: 'Các dòng laptop chuyên game mạnh mẽ' }),
  parentId: z.string().uuid().nullable().optional().openapi({ example: null }),
});
registry.register('CreateCategoryDto', createCategorySchema);

export const updateCategorySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .optional()
      .openapi({ example: 'Laptop Gaming Cao Cấp' }),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .optional()
      .openapi({ example: 'laptop-gaming-cao-cap' }),
    description: z.string().trim().nullable().optional().openapi({ example: 'Mô tả mới' }),
    parentId: z.string().uuid().nullable().optional().openapi({ example: null }),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'validation.updateAtLeastOneField',
  });
registry.register('UpdateCategoryDto', updateCategorySchema);

// ==================== Brand Schemas ====================

export const brandIdParamSchema = z.object({
  id: z
    .string()
    .uuid('validation.invalidValue')
    .openapi({ example: '4fa85f64-5717-4562-b3fc-2c963f66afa6' }),
});
registry.register('BrandIdParamDto', brandIdParamSchema);

export const brandSlugParamSchema = z.object({
  slug: z.string().trim().min(1).max(100).openapi({ example: 'apple' }),
});
registry.register('BrandSlugParamDto', brandSlugParamSchema);

export const createBrandSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'validation.brandNameRequired')
    .max(100)
    .openapi({ example: 'Apple' }),
  slug: z.string().trim().min(1).max(100).optional().openapi({ example: 'apple' }),
  description: z.string().trim().optional().openapi({ example: 'Thương hiệu Apple Inc.' }),
});
registry.register('CreateBrandDto', createBrandSchema);

export const updateBrandSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional().openapi({ example: 'Apple Updated' }),
    slug: z.string().trim().min(1).max(100).optional().openapi({ example: 'apple-updated' }),
    description: z.string().trim().nullable().optional().openapi({ example: 'Mô tả thương hiệu' }),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'validation.updateAtLeastOneField',
  });
registry.register('UpdateBrandDto', updateBrandSchema);

// ==================== Specification & Image Sub-Schemas ====================

export const createSpecificationItemSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'validation.specNameRequired')
    .max(100)
    .openapi({ example: 'CPU' }),
  value: z
    .string()
    .trim()
    .min(1, 'validation.specValueRequired')
    .max(255)
    .openapi({ example: 'Apple M3 Pro' }),
  displayOrder: z.number().int().default(0).openapi({ example: 0 }),
});

export const createVariantItemSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(1, 'validation.skuRequired')
    .max(100)
    .openapi({ example: 'MBP14-M3-18-512' }),
  name: z.string().trim().min(1).max(150).openapi({ example: '18GB RAM / 512GB SSD / Space Gray' }),
  price: z.coerce
    .bigint()
    .refine((val) => val >= 0n, { message: 'validation.priceMustBePositive' })
    .openapi({ example: 49990000 }),
  compareAtPrice: z.coerce
    .bigint()
    .refine((val) => val >= 0n, { message: 'validation.priceMustBePositive' })
    .optional()
    .openapi({ example: 52990000 }),
  options: z
    .record(z.string(), z.unknown())
    .optional()
    .openapi({ example: { color: 'Space Gray', ram: '18GB', storage: '512GB' } }),
  isActive: z.boolean().default(true).openapi({ example: true }),
});

// ==================== Product Schemas ====================

export const productIdParamSchema = z.object({
  id: z
    .string()
    .uuid('validation.invalidValue')
    .openapi({ example: '5fa85f64-5717-4562-b3fc-2c963f66afa6' }),
});
registry.register('ProductIdParamDto', productIdParamSchema);

export const productSlugParamSchema = z.object({
  slug: z.string().trim().min(1).max(255).openapi({ example: 'macbook-pro-14-m3-pro' }),
});
registry.register('ProductSlugParamDto', productSlugParamSchema);

export const createProductSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'validation.productNameRequired')
    .max(255)
    .openapi({ example: 'MacBook Pro 14 M3 Pro' }),
  slug: z.string().trim().min(1).max(255).optional().openapi({ example: 'macbook-pro-14-m3-pro' }),
  description: z
    .string()
    .trim()
    .optional()
    .openapi({ example: 'Chi tiết dòng MacBook Pro 14 M3 Pro' }),
  status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE']).default('DRAFT').openapi({ example: 'ACTIVE' }),
  categoryId: z
    .string()
    .uuid('validation.invalidValue')
    .openapi({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
  brandId: z
    .string()
    .uuid('validation.invalidValue')
    .nullable()
    .optional()
    .openapi({ example: '4fa85f64-5717-4562-b3fc-2c963f66afa6' }),
  specifications: z.array(createSpecificationItemSchema).optional().default([]),
  variants: z.array(createVariantItemSchema).optional().default([]),
});
registry.register('CreateProductDto', createProductSchema);

export const updateProductSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .optional()
      .openapi({ example: 'MacBook Pro 14 M3 Pro 2024' }),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .optional()
      .openapi({ example: 'macbook-pro-14-m3-pro-2024' }),
    description: z.string().trim().nullable().optional().openapi({ example: 'Mô tả cập nhật' }),
    status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE']).optional().openapi({ example: 'ACTIVE' }),
    categoryId: z
      .string()
      .uuid('validation.invalidValue')
      .optional()
      .openapi({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
    brandId: z
      .string()
      .uuid('validation.invalidValue')
      .nullable()
      .optional()
      .openapi({ example: '4fa85f64-5717-4562-b3fc-2c963f66afa6' }),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'validation.updateAtLeastOneField',
  });
registry.register('UpdateProductDto', updateProductSchema);

// ==================== Variant Schemas ====================

export const variantIdParamSchema = z.object({
  id: z
    .string()
    .uuid('validation.invalidValue')
    .openapi({ example: '6fa85f64-5717-4562-b3fc-2c963f66afa6' }),
});
registry.register('VariantIdParamDto', variantIdParamSchema);

export const createVariantSchema = createVariantItemSchema;
registry.register('CreateVariantDto', createVariantSchema);

export const updateVariantSchema = z
  .object({
    sku: z.string().trim().min(1).max(100).optional().openapi({ example: 'MBP14-M3-18-512-NEW' }),
    name: z.string().trim().min(1).max(150).optional().openapi({ example: '18GB / 512GB Silver' }),
    price: z.coerce
      .bigint()
      .refine((val) => val >= 0n, { message: 'validation.priceMustBePositive' })
      .optional()
      .openapi({ example: 48990000 }),
    compareAtPrice: z.coerce
      .bigint()
      .refine((val) => val >= 0n, { message: 'validation.priceMustBePositive' })
      .nullable()
      .optional()
      .openapi({ example: 52990000 }),
    options: z
      .record(z.string(), z.unknown())
      .nullable()
      .optional()
      .openapi({ example: { color: 'Silver', ram: '18GB', storage: '512GB' } }),
    isActive: z.boolean().optional().openapi({ example: true }),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'validation.updateAtLeastOneField',
  });
registry.register('UpdateVariantDto', updateVariantSchema);

// ==================== Product Image Schemas ====================

export const imageIdParamSchema = z.object({
  id: z
    .string()
    .uuid('validation.invalidValue')
    .openapi({ example: '7fa85f64-5717-4562-b3fc-2c963f66afa6' }),
});
registry.register('ImageIdParamDto', imageIdParamSchema);

export const createProductImageSchema = z.object({
  isThumbnail: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional()
    .default(false)
    .openapi({ example: 'true' }),
  displayOrder: z.coerce.number().int().default(0).openapi({ example: 0 }),
  altText: z.string().trim().max(255).optional().openapi({ example: 'Mặt trước sản phẩm' }),
});
registry.register('CreateProductImageDto', createProductImageSchema);

export const updateProductImageSchema = z
  .object({
    isThumbnail: z.boolean().optional().openapi({ example: true }),
    displayOrder: z.number().int().optional().openapi({ example: 1 }),
    altText: z.string().trim().max(255).nullable().optional().openapi({ example: 'Mặt trước sản phẩm' }),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'validation.updateAtLeastOneField',
  });
registry.register('UpdateProductImageDto', updateProductImageSchema);

export const imageUploadRequestSchema = createProductImageSchema.extend({
  file: z
    .string()
    .openapi({ format: 'binary', description: 'JPEG, PNG or WebP image up to 10 MB' }),
});
registry.register('ImageUploadRequestDto', imageUploadRequestSchema);

export const brandLogoUploadRequestSchema = z.object({
  file: z.string().openapi({ format: 'binary', description: 'JPEG, PNG or WebP image up to 5 MB' }),
});
registry.register('BrandLogoUploadRequestDto', brandLogoUploadRequestSchema);

export const brandResponseDataSchema = z.object({
  brand: z.object({
    id: z.string().uuid().openapi({ example: '4fa85f64-5717-4562-b3fc-2c963f66afa6' }),
    name: z.string().openapi({ example: 'Apple' }),
    slug: z.string().openapi({ example: 'apple' }),
    description: z.string().nullable().openapi({ example: 'Apple Inc.' }),
    logoUrl: z.string().url().nullable().openapi({
      example: 'https://cdn.example.com/brands/550e8400-e29b-41d4-a716-446655440000.png',
    }),
    createdAt: z.string().datetime().openapi({ example: '2026-08-26T10:00:00.000Z' }),
    updatedAt: z.string().datetime().openapi({ example: '2026-08-26T10:00:00.000Z' }),
  }),
});
registry.register('BrandResponseDataDto', brandResponseDataSchema);

export const productImageResponseDataSchema = z.object({
  image: z.object({
    id: z.string().uuid().openapi({ example: '7fa85f64-5717-4562-b3fc-2c963f66afa6' }),
    productId: z.string().uuid().openapi({ example: '5fa85f64-5717-4562-b3fc-2c963f66afa6' }),
    url: z.string().url().openapi({
      example: 'https://cdn.example.com/products/550e8400-e29b-41d4-a716-446655440000.jpg',
    }),
    isThumbnail: z.boolean().openapi({ example: true }),
    displayOrder: z.number().int().openapi({ example: 0 }),
    altText: z.string().nullable().openapi({ example: 'Mặt trước sản phẩm' }),
    createdAt: z.string().datetime().openapi({ example: '2026-08-26T10:00:00.000Z' }),
  }),
});
registry.register('ProductImageResponseDataDto', productImageResponseDataSchema);

const productVariantResponseSchema = z.object({
  id: z.string().uuid().openapi({ example: '6fa85f64-5717-4562-b3fc-2c963f66afa6' }),
  productId: z.string().uuid().openapi({ example: '5fa85f64-5717-4562-b3fc-2c963f66afa6' }),
  sku: z.string().openapi({ example: 'MBP14-M3-18-512' }),
  name: z.string().openapi({ example: '18GB / 512GB Silver' }),
  price: z
    .string()
    .openapi({ example: '49990000', description: 'Integer VND serialized as string' }),
  compareAtPrice: z.string().nullable().openapi({ example: '52990000' }),
  options: z
    .record(z.string(), z.unknown())
    .nullable()
    .openapi({ example: { color: 'Silver' } }),
  isActive: z.boolean().openapi({ example: true }),
  createdAt: z.string().datetime().openapi({ example: '2026-08-26T10:00:00.000Z' }),
  updatedAt: z.string().datetime().openapi({ example: '2026-08-26T10:00:00.000Z' }),
});

const productListBaseSchema = z.object({
  id: z.string().uuid().openapi({ example: '5fa85f64-5717-4562-b3fc-2c963f66afa6' }),
  name: z.string().openapi({ example: 'MacBook Pro 14 M3 Pro' }),
  slug: z.string().openapi({ example: 'macbook-pro-14-m3-pro' }),
  description: z.string().nullable().openapi({ example: 'MacBook Pro with Apple M3 Pro' }),
  status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE']).openapi({ example: 'ACTIVE' }),
  categoryId: z.string().uuid().openapi({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
  brandId: z
    .string()
    .uuid()
    .nullable()
    .openapi({ example: '4fa85f64-5717-4562-b3fc-2c963f66afa6' }),
  createdAt: z.string().datetime().openapi({ example: '2026-08-26T10:00:00.000Z' }),
  updatedAt: z.string().datetime().openapi({ example: '2026-08-26T10:00:00.000Z' }),
});

export const publicProductListItemResponseSchema = productListBaseSchema.extend({
  category: z.object({
    id: z.string().uuid().openapi({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
    name: z.string().openapi({ example: 'Laptop' }),
    slug: z.string().openapi({ example: 'laptop' }),
  }),
  brand: z
    .object({
      id: z.string().uuid().openapi({ example: '4fa85f64-5717-4562-b3fc-2c963f66afa6' }),
      name: z.string().openapi({ example: 'Apple' }),
      slug: z.string().openapi({ example: 'apple' }),
      logoUrl: z
        .string()
        .url()
        .nullable()
        .openapi({ example: 'https://cdn.example.com/brands/apple.png' }),
    })
    .nullable(),
  images: z.array(
    z.object({
      url: z.string().url().openapi({ example: 'https://cdn.example.com/products/macbook.jpg' }),
      altText: z.string().nullable().openapi({ example: 'MacBook Pro thumbnail' }),
    }),
  ),
  variants: z.array(
    z.object({
      id: z.string().uuid().openapi({ example: '6fa85f64-5717-4562-b3fc-2c963f66afa6' }),
      sku: z.string().openapi({ example: 'MBP14-M3-18-512' }),
      name: z.string().openapi({ example: '18GB / 512GB Silver' }),
      price: z.string().openapi({ example: '49990000' }),
      compareAtPrice: z.string().nullable().openapi({ example: '52990000' }),
    }),
  ),
});
registry.register('PublicProductListItemResponseDto', publicProductListItemResponseSchema);

export const adminProductListItemResponseSchema = productListBaseSchema.extend({
  category: z.object({
    id: z.string().uuid().openapi({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
    name: z.string().openapi({ example: 'Laptop' }),
    slug: z.string().openapi({ example: 'laptop' }),
  }),
  brand: z
    .object({
      id: z.string().uuid().openapi({ example: '4fa85f64-5717-4562-b3fc-2c963f66afa6' }),
      name: z.string().openapi({ example: 'Apple' }),
      slug: z.string().openapi({ example: 'apple' }),
    })
    .nullable(),
  images: z.array(
    z.object({
      url: z.string().url().openapi({ example: 'https://cdn.example.com/products/macbook.jpg' }),
    }),
  ),
  variants: z.array(
    z.object({
      id: z.string().uuid().openapi({ example: '6fa85f64-5717-4562-b3fc-2c963f66afa6' }),
      sku: z.string().openapi({ example: 'MBP14-M3-18-512' }),
      name: z.string().openapi({ example: '18GB / 512GB Silver' }),
      price: z.string().openapi({ example: '49990000' }),
      isActive: z.boolean().openapi({ example: true }),
    }),
  ),
});
registry.register('AdminProductListItemResponseDto', adminProductListItemResponseSchema);

export const productResponseDataSchema = z.object({
  product: z.object({
    id: z.string().uuid().openapi({ example: '5fa85f64-5717-4562-b3fc-2c963f66afa6' }),
    name: z.string().openapi({ example: 'MacBook Pro 14 M3 Pro' }),
    slug: z.string().openapi({ example: 'macbook-pro-14-m3-pro' }),
    description: z.string().nullable().openapi({ example: 'MacBook Pro with Apple M3 Pro' }),
    status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE']).openapi({ example: 'DRAFT' }),
    categoryId: z.string().uuid().openapi({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
    brandId: z
      .string()
      .uuid()
      .nullable()
      .openapi({ example: '4fa85f64-5717-4562-b3fc-2c963f66afa6' }),
    category: z
      .object({
        id: z.string().uuid(),
        name: z.string().openapi({ example: 'Laptop' }),
        slug: z.string().openapi({ example: 'laptop' }),
      })
      .passthrough(),
    brand: z
      .object({
        id: z.string().uuid(),
        name: z.string().openapi({ example: 'Apple' }),
        slug: z.string().openapi({ example: 'apple' }),
      })
      .passthrough()
      .nullable(),
    images: z.array(productImageResponseDataSchema.shape.image),
    specifications: z.array(
      z.object({
        id: z.string().uuid(),
        productId: z.string().uuid(),
        name: z.string().openapi({ example: 'CPU' }),
        value: z.string().openapi({ example: 'Apple M3 Pro' }),
        displayOrder: z.number().int().openapi({ example: 0 }),
      }),
    ),
    variants: z.array(productVariantResponseSchema),
    createdAt: z.string().datetime().openapi({ example: '2026-08-26T10:00:00.000Z' }),
    updatedAt: z.string().datetime().openapi({ example: '2026-08-26T10:00:00.000Z' }),
  }),
});
registry.register('ProductResponseDataDto', productResponseDataSchema);

// ==================== Product Specification Schemas ====================

export const specIdParamSchema = z.object({
  id: z
    .string()
    .uuid('validation.invalidValue')
    .openapi({ example: '8fa85f64-5717-4562-b3fc-2c963f66afa6' }),
});
registry.register('SpecIdParamDto', specIdParamSchema);

export const createProductSpecSchema = createSpecificationItemSchema;
registry.register('CreateProductSpecDto', createProductSpecSchema);

export const updateProductSpecSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'validation.specNameRequired')
      .max(100)
      .optional()
      .openapi({ example: 'CPU' }),
    value: z
      .string()
      .trim()
      .min(1, 'validation.specValueRequired')
      .max(255)
      .optional()
      .openapi({ example: 'Apple M3 Pro' }),
    displayOrder: z.number().int().optional().openapi({ example: 0 }),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'validation.updateAtLeastOneField',
  });
registry.register('UpdateProductSpecDto', updateProductSpecSchema);

export const variantResponseDataSchema = z.object({
  variant: productVariantResponseSchema,
});
registry.register('VariantResponseDataDto', variantResponseDataSchema);

export const productSpecResponseDataSchema = z.object({
  spec: z.object({
    id: z.string().uuid().openapi({ example: '8fa85f64-5717-4562-b3fc-2c963f66afa6' }),
    productId: z.string().uuid().openapi({ example: '5fa85f64-5717-4562-b3fc-2c963f66afa6' }),
    name: z.string().openapi({ example: 'CPU' }),
    value: z.string().openapi({ example: 'Apple M3 Pro' }),
    displayOrder: z.number().int().openapi({ example: 0 }),
    createdAt: z.string().datetime().openapi({ example: '2026-08-26T10:00:00.000Z' }),
  }),
});
registry.register('ProductSpecResponseDataDto', productSpecResponseDataSchema);

// ==================== Query Filter Schemas ====================

export const listProductsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1).openapi({ example: 1 }),
    pageSize: z.coerce.number().int().positive().max(100).default(20).openapi({ example: 20 }),
    search: z.string().trim().optional().openapi({ example: 'macbook' }),
    categorySlug: z.string().trim().optional().openapi({ example: 'laptop' }),
    brandSlug: z.string().trim().optional().openapi({ example: 'apple' }),
    minPrice: z.coerce
      .bigint()
      .refine((val) => val >= 0n, { message: 'validation.priceMustBePositive' })
      .optional()
      .openapi({ example: 10000000 }),
    maxPrice: z.coerce
      .bigint()
      .refine((val) => val >= 0n, { message: 'validation.priceMustBePositive' })
      .optional()
      .openapi({ example: 50000000 }),
    sortBy: z
      .enum(['createdAt_desc', 'price_asc', 'price_desc', 'name_asc'])
      .default('createdAt_desc')
      .openapi({ example: 'price_asc' }),
    specs: z.string().trim().optional().openapi({
      example: 'RAM:16GB,Storage:512GB',
      description: 'Comma-separated specification filters in key:value format',
    }),
  })
  .refine(
    (data) =>
      data.minPrice === undefined || data.maxPrice === undefined || data.minPrice <= data.maxPrice,
    {
      message: 'validation.invalidValue',
      path: ['maxPrice'],
    },
  );
registry.register('ListProductsQueryDto', listProductsQuerySchema);

export const adminListProductsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1).openapi({ example: 1 }),
  pageSize: z.coerce.number().int().positive().max(100).default(20).openapi({ example: 20 }),
  search: z.string().trim().optional().openapi({ example: 'macbook' }),
  status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE']).optional().openapi({ example: 'ACTIVE' }),
  categoryId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
  sortBy: z
    .enum(['createdAt_desc', 'createdAt_asc', 'name_asc', 'name_desc'])
    .default('createdAt_desc'),
});
registry.register('AdminListProductsQueryDto', adminListProductsQuerySchema);

// ==================== Exported DTO Types ====================

export type CategoryIdParamDto = z.infer<typeof categoryIdParamSchema>;
export type CategorySlugParamDto = z.infer<typeof categorySlugParamSchema>;
export type CreateCategoryDto = z.infer<typeof createCategorySchema>;
export type UpdateCategoryDto = z.infer<typeof updateCategorySchema>;

export type BrandIdParamDto = z.infer<typeof brandIdParamSchema>;
export type BrandSlugParamDto = z.infer<typeof brandSlugParamSchema>;
export type CreateBrandDto = z.infer<typeof createBrandSchema>;
export type UpdateBrandDto = z.infer<typeof updateBrandSchema>;

export type ProductIdParamDto = z.infer<typeof productIdParamSchema>;
export type ProductSlugParamDto = z.infer<typeof productSlugParamSchema>;
export type CreateProductDto = z.infer<typeof createProductSchema>;
export type UpdateProductDto = z.infer<typeof updateProductSchema>;

export type VariantIdParamDto = z.infer<typeof variantIdParamSchema>;
export type CreateVariantDto = z.infer<typeof createVariantSchema>;
export type UpdateVariantDto = z.infer<typeof updateVariantSchema>;

export type ImageIdParamDto = z.infer<typeof imageIdParamSchema>;
export type CreateProductImageDto = z.infer<typeof createProductImageSchema>;
export type UpdateProductImageDto = z.infer<typeof updateProductImageSchema>;

export type SpecIdParamDto = z.infer<typeof specIdParamSchema>;
export type CreateProductSpecDto = z.infer<typeof createProductSpecSchema>;
export type UpdateProductSpecDto = z.infer<typeof updateProductSpecSchema>;

export type ListProductsQueryDto = z.infer<typeof listProductsQuerySchema>;
export type AdminListProductsQueryDto = z.infer<typeof adminListProductsQuerySchema>;
