import { Router } from 'express';
import { ERROR_CODES, PERMISSIONS, UPLOAD_PURPOSES } from '../../constants/index.js';
import {
  createPaginatedResponseSchema,
  createSuccessResponseSchema,
  errorResponse,
  registry,
} from '../../docs/registry.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requirePermission } from '../../middlewares/permission.middleware.js';
import { uploadSingleImage } from '../uploads/uploads.middleware.js';
import { UPLOAD_POLICIES } from '../uploads/uploads.policy.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middlewares/validate.middleware.js';
import { catalogController } from './catalog.controller.js';
import {
  adminListProductsQuerySchema,
  adminProductListItemResponseSchema,
  brandLogoUploadRequestSchema,
  brandResponseDataSchema,
  brandIdParamSchema,
  brandSlugParamSchema,
  categoryIdParamSchema,
  categorySlugParamSchema,
  createBrandSchema,
  createCategorySchema,
  createProductImageSchema,
  createProductSchema,
  createProductSpecSchema,
  createVariantSchema,
  imageIdParamSchema,
  imageUploadRequestSchema,
  listProductsQuerySchema,
  productIdParamSchema,
  productImageResponseDataSchema,
  productResponseDataSchema,
  productSlugParamSchema,
  productSpecResponseDataSchema,
  publicProductListItemResponseSchema,
  specIdParamSchema,
  updateBrandSchema,
  updateCategorySchema,
  updateProductImageSchema,
  updateProductSchema,
  updateProductSpecSchema,
  updateVariantSchema,
  variantIdParamSchema,
  variantResponseDataSchema,
} from './catalog.schema.js';

export const publicCatalogRouter = Router();
export const adminCatalogRouter = Router();

// ==================== Public Category Routes ====================

registry.registerPath({
  method: 'get',
  path: '/categories',
  summary: 'Get full category hierarchy tree',
  tags: ['Categories'],
  responses: {
    200: {
      description: 'Categories hierarchy retrieved successfully',
    },
  },
});
publicCatalogRouter.get('/categories', catalogController.getCategories);

registry.registerPath({
  method: 'get',
  path: '/categories/{slug}',
  summary: 'Get category by slug',
  tags: ['Categories'],
  request: {
    params: categorySlugParamSchema,
  },
  responses: {
    200: {
      description: 'Category retrieved successfully',
    },
    404: errorResponse(ERROR_CODES.CATEGORY_NOT_FOUND),
  },
});
publicCatalogRouter.get(
  '/categories/:slug',
  validateParams(categorySlugParamSchema),
  catalogController.getCategoryBySlug,
);

// ==================== Public Brand Routes ====================

registry.registerPath({
  method: 'get',
  path: '/brands',
  summary: 'Get all active brands',
  tags: ['Brands'],
  responses: {
    200: {
      description: 'Brands list retrieved successfully',
    },
  },
});
publicCatalogRouter.get('/brands', catalogController.getBrands);

registry.registerPath({
  method: 'get',
  path: '/brands/{slug}',
  summary: 'Get brand by slug',
  tags: ['Brands'],
  request: {
    params: brandSlugParamSchema,
  },
  responses: {
    200: {
      description: 'Brand retrieved successfully',
    },
    404: errorResponse(ERROR_CODES.BRAND_NOT_FOUND),
  },
});
publicCatalogRouter.get(
  '/brands/:slug',
  validateParams(brandSlugParamSchema),
  catalogController.getBrandBySlug,
);

// ==================== Public Product Routes ====================

registry.registerPath({
  method: 'get',
  path: '/products',
  summary: 'List active products with filters and pagination',
  tags: ['Products'],
  request: {
    query: listProductsQuerySchema,
  },
  responses: {
    200: {
      description: 'Paginated active products list retrieved successfully',
      content: {
        'application/json': {
          schema: createPaginatedResponseSchema(publicProductListItemResponseSchema),
        },
      },
    },
  },
});
publicCatalogRouter.get(
  '/products',
  validateQuery(listProductsQuerySchema),
  catalogController.listPublicProducts,
);

registry.registerPath({
  method: 'get',
  path: '/products/{slug}',
  summary: 'Get active product details by slug',
  tags: ['Products'],
  request: {
    params: productSlugParamSchema,
  },
  responses: {
    200: {
      description: 'Product details retrieved successfully',
      content: {
        'application/json': { schema: createSuccessResponseSchema(productResponseDataSchema) },
      },
    },
    404: errorResponse(ERROR_CODES.PRODUCT_NOT_FOUND),
  },
});
publicCatalogRouter.get(
  '/products/:slug',
  validateParams(productSlugParamSchema),
  catalogController.getPublicProductBySlug,
);

// ==================== Admin Routes Protection ====================

adminCatalogRouter.use(
  requireAuth,
  requirePermission(PERMISSIONS.CATALOG_READ, PERMISSIONS.CATALOG_WRITE),
);

const requireCatalogWrite = requirePermission(PERMISSIONS.CATALOG_WRITE);

// --- Admin Categories ---

registry.registerPath({
  method: 'get',
  path: '/admin/categories/{id}',
  summary: 'Get category by ID (Admin)',
  tags: ['Categories'],
  security: [{ bearerAuth: [] }],
  request: { params: categoryIdParamSchema },
  responses: {
    200: { description: 'Category retrieved' },
    404: errorResponse(ERROR_CODES.CATEGORY_NOT_FOUND),
  },
});
adminCatalogRouter.get(
  '/categories/:id',
  validateParams(categoryIdParamSchema),
  catalogController.getCategoryById,
);

registry.registerPath({
  method: 'post',
  path: '/admin/categories',
  summary: 'Create category (Admin)',
  tags: ['Categories'],
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { 'application/json': { schema: createCategorySchema } } },
  },
  responses: {
    201: { description: 'Category created' },
    404: errorResponse(ERROR_CODES.CATEGORY_NOT_FOUND),
    409: errorResponse(ERROR_CODES.CATEGORY_SLUG_EXISTS),
  },
});
adminCatalogRouter.post(
  '/categories',
  requireCatalogWrite,
  validateBody(createCategorySchema),
  catalogController.createCategory,
);

registry.registerPath({
  method: 'patch',
  path: '/admin/categories/{id}',
  summary: 'Update category (Admin)',
  tags: ['Categories'],
  security: [{ bearerAuth: [] }],
  request: {
    params: categoryIdParamSchema,
    body: { content: { 'application/json': { schema: updateCategorySchema } } },
  },
  responses: {
    200: { description: 'Category updated' },
    404: errorResponse(ERROR_CODES.CATEGORY_NOT_FOUND),
    409: errorResponse(ERROR_CODES.CATEGORY_SLUG_EXISTS),
    422: errorResponse(ERROR_CODES.CATEGORY_CYCLIC_HIERARCHY),
  },
});
adminCatalogRouter.patch(
  '/categories/:id',
  requireCatalogWrite,
  validateParams(categoryIdParamSchema),
  validateBody(updateCategorySchema),
  catalogController.updateCategory,
);

registry.registerPath({
  method: 'delete',
  path: '/admin/categories/{id}',
  summary: 'Delete category (Admin)',
  tags: ['Categories'],
  security: [{ bearerAuth: [] }],
  request: { params: categoryIdParamSchema },
  responses: {
    200: { description: 'Category deleted' },
    404: errorResponse(ERROR_CODES.CATEGORY_NOT_FOUND),
    409: errorResponse([ERROR_CODES.CATEGORY_HAS_CHILDREN, ERROR_CODES.CATEGORY_HAS_PRODUCTS]),
  },
});
adminCatalogRouter.delete(
  '/categories/:id',
  requireCatalogWrite,
  validateParams(categoryIdParamSchema),
  catalogController.deleteCategory,
);

// --- Admin Brands ---

registry.registerPath({
  method: 'get',
  path: '/admin/brands/{id}',
  summary: 'Get brand by ID (Admin)',
  tags: ['Brands'],
  security: [{ bearerAuth: [] }],
  request: { params: brandIdParamSchema },
  responses: {
    200: { description: 'Brand retrieved' },
    404: errorResponse(ERROR_CODES.BRAND_NOT_FOUND),
  },
});
adminCatalogRouter.get(
  '/brands/:id',
  validateParams(brandIdParamSchema),
  catalogController.getBrandById,
);

registry.registerPath({
  method: 'post',
  path: '/admin/brands',
  summary: 'Create brand (Admin)',
  tags: ['Brands'],
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { 'application/json': { schema: createBrandSchema } } },
  },
  responses: {
    201: {
      description: 'Brand created',
      content: {
        'application/json': { schema: createSuccessResponseSchema(brandResponseDataSchema) },
      },
    },
    409: errorResponse(ERROR_CODES.BRAND_SLUG_EXISTS),
  },
});
adminCatalogRouter.post(
  '/brands',
  requireCatalogWrite,
  validateBody(createBrandSchema),
  catalogController.createBrand,
);

registry.registerPath({
  method: 'patch',
  path: '/admin/brands/{id}',
  summary: 'Update brand (Admin)',
  tags: ['Brands'],
  security: [{ bearerAuth: [] }],
  request: {
    params: brandIdParamSchema,
    body: { content: { 'application/json': { schema: updateBrandSchema } } },
  },
  responses: {
    200: {
      description: 'Brand updated',
      content: {
        'application/json': { schema: createSuccessResponseSchema(brandResponseDataSchema) },
      },
    },
    404: errorResponse(ERROR_CODES.BRAND_NOT_FOUND),
    409: errorResponse(ERROR_CODES.BRAND_SLUG_EXISTS),
  },
});
adminCatalogRouter.patch(
  '/brands/:id',
  requireCatalogWrite,
  validateParams(brandIdParamSchema),
  validateBody(updateBrandSchema),
  catalogController.updateBrand,
);

registry.registerPath({
  method: 'put',
  path: '/admin/brands/{id}/logo',
  summary: 'Upload or replace brand logo',
  tags: ['Brands'],
  security: [{ bearerAuth: [] }],
  request: {
    params: brandIdParamSchema,
    body: { content: { 'multipart/form-data': { schema: brandLogoUploadRequestSchema } } },
  },
  responses: {
    200: {
      description: 'Brand logo updated',
      content: {
        'application/json': { schema: createSuccessResponseSchema(brandResponseDataSchema) },
      },
    },
    404: errorResponse(ERROR_CODES.BRAND_NOT_FOUND),
    422: errorResponse([
      ERROR_CODES.FILE_REQUIRED,
      ERROR_CODES.INVALID_FILE_TYPE,
      ERROR_CODES.FILE_SIZE_EXCEEDED,
    ]),
  },
});
adminCatalogRouter.put(
  '/brands/:id/logo',
  requireCatalogWrite,
  validateParams(brandIdParamSchema),
  uploadSingleImage(UPLOAD_POLICIES[UPLOAD_PURPOSES.BRAND_LOGO]),
  catalogController.updateBrandLogo,
);

registry.registerPath({
  method: 'delete',
  path: '/admin/brands/{id}/logo',
  summary: 'Remove brand logo',
  tags: ['Brands'],
  security: [{ bearerAuth: [] }],
  request: { params: brandIdParamSchema },
  responses: {
    200: {
      description: 'Brand logo removed',
      content: {
        'application/json': { schema: createSuccessResponseSchema(brandResponseDataSchema) },
      },
    },
    404: errorResponse(ERROR_CODES.BRAND_NOT_FOUND),
  },
});
adminCatalogRouter.delete(
  '/brands/:id/logo',
  requireCatalogWrite,
  validateParams(brandIdParamSchema),
  catalogController.deleteBrandLogo,
);

registry.registerPath({
  method: 'delete',
  path: '/admin/brands/{id}',
  summary: 'Delete brand (Admin)',
  tags: ['Brands'],
  security: [{ bearerAuth: [] }],
  request: { params: brandIdParamSchema },
  responses: {
    200: { description: 'Brand deleted' },
    404: errorResponse(ERROR_CODES.BRAND_NOT_FOUND),
    409: errorResponse(ERROR_CODES.BRAND_HAS_PRODUCTS),
  },
});
adminCatalogRouter.delete(
  '/brands/:id',
  requireCatalogWrite,
  validateParams(brandIdParamSchema),
  catalogController.deleteBrand,
);

// --- Admin Products ---

registry.registerPath({
  method: 'get',
  path: '/admin/products',
  summary: 'List all products with filters (Admin)',
  tags: ['Products'],
  security: [{ bearerAuth: [] }],
  request: { query: adminListProductsQuerySchema },
  responses: {
    200: {
      description: 'Admin products list retrieved',
      content: {
        'application/json': {
          schema: createPaginatedResponseSchema(adminProductListItemResponseSchema),
        },
      },
    },
  },
});
adminCatalogRouter.get(
  '/products',
  validateQuery(adminListProductsQuerySchema),
  catalogController.listAdminProducts,
);

registry.registerPath({
  method: 'get',
  path: '/admin/products/{id}',
  summary: 'Get product by ID (Admin)',
  tags: ['Products'],
  security: [{ bearerAuth: [] }],
  request: { params: productIdParamSchema },
  responses: {
    200: {
      description: 'Product retrieved',
      content: {
        'application/json': { schema: createSuccessResponseSchema(productResponseDataSchema) },
      },
    },
    404: errorResponse(ERROR_CODES.PRODUCT_NOT_FOUND),
  },
});
adminCatalogRouter.get(
  '/products/:id',
  validateParams(productIdParamSchema),
  catalogController.getProductById,
);

registry.registerPath({
  method: 'post',
  path: '/admin/products',
  summary: 'Create new product with variants and specifications (Admin)',
  tags: ['Products'],
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { 'application/json': { schema: createProductSchema } } },
  },
  responses: {
    201: {
      description: 'Product created',
      content: {
        'application/json': { schema: createSuccessResponseSchema(productResponseDataSchema) },
      },
    },
    404: errorResponse([ERROR_CODES.CATEGORY_NOT_FOUND, ERROR_CODES.BRAND_NOT_FOUND]),
    409: errorResponse([ERROR_CODES.PRODUCT_SLUG_EXISTS, ERROR_CODES.PRODUCT_SKU_EXISTS]),
  },
});
adminCatalogRouter.post(
  '/products',
  requireCatalogWrite,
  validateBody(createProductSchema),
  catalogController.createProduct,
);

registry.registerPath({
  method: 'patch',
  path: '/admin/products/{id}',
  summary: 'Update product basic details (Admin)',
  tags: ['Products'],
  security: [{ bearerAuth: [] }],
  request: {
    params: productIdParamSchema,
    body: { content: { 'application/json': { schema: updateProductSchema } } },
  },
  responses: {
    200: {
      description: 'Product updated',
      content: {
        'application/json': { schema: createSuccessResponseSchema(productResponseDataSchema) },
      },
    },
    404: errorResponse([
      ERROR_CODES.PRODUCT_NOT_FOUND,
      ERROR_CODES.CATEGORY_NOT_FOUND,
      ERROR_CODES.BRAND_NOT_FOUND,
    ]),
    409: errorResponse(ERROR_CODES.PRODUCT_SLUG_EXISTS),
  },
});
adminCatalogRouter.patch(
  '/products/:id',
  requireCatalogWrite,
  validateParams(productIdParamSchema),
  validateBody(updateProductSchema),
  catalogController.updateProduct,
);

registry.registerPath({
  method: 'delete',
  path: '/admin/products/{id}',
  summary: 'Delete product (Admin)',
  tags: ['Products'],
  security: [{ bearerAuth: [] }],
  request: { params: productIdParamSchema },
  responses: {
    200: { description: 'Product deleted' },
    404: errorResponse(ERROR_CODES.PRODUCT_NOT_FOUND),
    409: errorResponse(ERROR_CODES.STOCK_HISTORY_EXISTS),
  },
});
adminCatalogRouter.delete(
  '/products/:id',
  requireCatalogWrite,
  validateParams(productIdParamSchema),
  catalogController.deleteProduct,
);

// --- Admin Variants ---

registry.registerPath({
  method: 'post',
  path: '/admin/products/{id}/variants',
  summary: 'Add variant to product (Admin)',
  tags: ['Variants'],
  security: [{ bearerAuth: [] }],
  request: {
    params: productIdParamSchema,
    body: { content: { 'application/json': { schema: createVariantSchema } } },
  },
  responses: {
    201: {
      description: 'Variant created',
      content: {
        'application/json': { schema: createSuccessResponseSchema(variantResponseDataSchema) },
      },
    },
    404: errorResponse(ERROR_CODES.PRODUCT_NOT_FOUND),
    409: errorResponse(ERROR_CODES.PRODUCT_SKU_EXISTS),
  },
});
adminCatalogRouter.post(
  '/products/:id/variants',
  requireCatalogWrite,
  validateParams(productIdParamSchema),
  validateBody(createVariantSchema),
  catalogController.createVariant,
);

registry.registerPath({
  method: 'patch',
  path: '/admin/variants/{id}',
  summary: 'Update variant (Admin)',
  tags: ['Variants'],
  security: [{ bearerAuth: [] }],
  request: {
    params: variantIdParamSchema,
    body: { content: { 'application/json': { schema: updateVariantSchema } } },
  },
  responses: {
    200: {
      description: 'Variant updated',
      content: {
        'application/json': { schema: createSuccessResponseSchema(variantResponseDataSchema) },
      },
    },
    404: errorResponse(ERROR_CODES.VARIANT_NOT_FOUND),
    409: errorResponse(ERROR_CODES.PRODUCT_SKU_EXISTS),
  },
});
adminCatalogRouter.patch(
  '/variants/:id',
  requireCatalogWrite,
  validateParams(variantIdParamSchema),
  validateBody(updateVariantSchema),
  catalogController.updateVariant,
);

registry.registerPath({
  method: 'delete',
  path: '/admin/variants/{id}',
  summary: 'Delete variant (Admin)',
  tags: ['Variants'],
  security: [{ bearerAuth: [] }],
  request: { params: variantIdParamSchema },
  responses: {
    200: { description: 'Variant deleted' },
    404: errorResponse(ERROR_CODES.VARIANT_NOT_FOUND),
    409: errorResponse(ERROR_CODES.STOCK_HISTORY_EXISTS),
  },
});
adminCatalogRouter.delete(
  '/variants/:id',
  requireCatalogWrite,
  validateParams(variantIdParamSchema),
  catalogController.deleteVariant,
);

// --- Admin Images ---

registry.registerPath({
  method: 'post',
  path: '/admin/products/{id}/images',
  summary: 'Add image to product (Admin)',
  tags: ['Images'],
  security: [{ bearerAuth: [] }],
  request: {
    params: productIdParamSchema,
    body: { content: { 'multipart/form-data': { schema: imageUploadRequestSchema } } },
  },
  responses: {
    201: {
      description: 'Image created',
      content: {
        'application/json': { schema: createSuccessResponseSchema(productImageResponseDataSchema) },
      },
    },
    404: errorResponse(ERROR_CODES.PRODUCT_NOT_FOUND),
    422: errorResponse([
      ERROR_CODES.FILE_REQUIRED,
      ERROR_CODES.INVALID_FILE_TYPE,
      ERROR_CODES.FILE_SIZE_EXCEEDED,
    ]),
  },
});
adminCatalogRouter.post(
  '/products/:id/images',
  requireCatalogWrite,
  validateParams(productIdParamSchema),
  uploadSingleImage(UPLOAD_POLICIES[UPLOAD_PURPOSES.PRODUCT_IMAGE]),
  validateBody(createProductImageSchema),
  catalogController.createImage,
);

registry.registerPath({
  method: 'patch',
  path: '/admin/images/{id}',
  summary: 'Update product image metadata (Admin)',
  tags: ['Images'],
  security: [{ bearerAuth: [] }],
  request: {
    params: imageIdParamSchema,
    body: { content: { 'application/json': { schema: updateProductImageSchema } } },
  },
  responses: {
    200: {
      description: 'Image updated',
      content: {
        'application/json': { schema: createSuccessResponseSchema(productImageResponseDataSchema) },
      },
    },
    404: errorResponse(ERROR_CODES.PRODUCT_IMAGE_NOT_FOUND),
  },
});
adminCatalogRouter.patch(
  '/images/:id',
  requireCatalogWrite,
  validateParams(imageIdParamSchema),
  validateBody(updateProductImageSchema),
  catalogController.updateImage,
);

registry.registerPath({
  method: 'delete',
  path: '/admin/images/{id}',
  summary: 'Delete image (Admin)',
  tags: ['Images'],
  security: [{ bearerAuth: [] }],
  request: { params: imageIdParamSchema },
  responses: {
    200: { description: 'Image deleted' },
    404: errorResponse(ERROR_CODES.PRODUCT_IMAGE_NOT_FOUND),
  },
});
adminCatalogRouter.delete(
  '/images/:id',
  requireCatalogWrite,
  validateParams(imageIdParamSchema),
  catalogController.deleteImage,
);

// --- Admin Specifications ---

registry.registerPath({
  method: 'post',
  path: '/admin/products/{id}/specifications',
  summary: 'Add specification to product (Admin)',
  tags: ['Specifications'],
  security: [{ bearerAuth: [] }],
  request: {
    params: productIdParamSchema,
    body: { content: { 'application/json': { schema: createProductSpecSchema } } },
  },
  responses: {
    201: {
      description: 'Specification created',
      content: {
        'application/json': { schema: createSuccessResponseSchema(productSpecResponseDataSchema) },
      },
    },
    404: errorResponse(ERROR_CODES.PRODUCT_NOT_FOUND),
  },
});
adminCatalogRouter.post(
  '/products/:id/specifications',
  requireCatalogWrite,
  validateParams(productIdParamSchema),
  validateBody(createProductSpecSchema),
  catalogController.createSpec,
);

registry.registerPath({
  method: 'patch',
  path: '/admin/specifications/{id}',
  summary: 'Update specification (Admin)',
  tags: ['Specifications'],
  security: [{ bearerAuth: [] }],
  request: {
    params: specIdParamSchema,
    body: { content: { 'application/json': { schema: updateProductSpecSchema } } },
  },
  responses: {
    200: {
      description: 'Specification updated',
      content: {
        'application/json': { schema: createSuccessResponseSchema(productSpecResponseDataSchema) },
      },
    },
    404: errorResponse(ERROR_CODES.SPECIFICATION_NOT_FOUND),
  },
});
adminCatalogRouter.patch(
  '/specifications/:id',
  requireCatalogWrite,
  validateParams(specIdParamSchema),
  validateBody(updateProductSpecSchema),
  catalogController.updateSpec,
);

registry.registerPath({
  method: 'delete',
  path: '/admin/specifications/{id}',
  summary: 'Delete specification (Admin)',
  tags: ['Specifications'],
  security: [{ bearerAuth: [] }],
  request: { params: specIdParamSchema },
  responses: {
    200: { description: 'Specification deleted' },
    404: errorResponse(ERROR_CODES.SPECIFICATION_NOT_FOUND),
  },
});
adminCatalogRouter.delete(
  '/specifications/:id',
  requireCatalogWrite,
  validateParams(specIdParamSchema),
  catalogController.deleteSpec,
);
