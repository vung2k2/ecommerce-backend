import type { RequestHandler } from 'express';
import { translate } from '../../i18n/index.js';
import { sendPaginated, sendSuccess } from '../../utils/response.js';
import type {
  AdminListProductsQueryDto,
  BrandIdParamDto,
  BrandSlugParamDto,
  CategoryIdParamDto,
  CategorySlugParamDto,
  CreateBrandDto,
  CreateCategoryDto,
  CreateProductDto,
  CreateProductImageDto,
  CreateProductSpecDto,
  CreateVariantDto,
  ImageIdParamDto,
  ListProductsQueryDto,
  ProductIdParamDto,
  ProductSlugParamDto,
  SpecIdParamDto,
  UpdateBrandDto,
  UpdateCategoryDto,
  UpdateProductDto,
  UpdateVariantDto,
  VariantIdParamDto,
} from './catalog.schema.js';
import { catalogService } from './catalog.service.js';

export const catalogController = {
  // ==================== Public Category Handlers ====================

  getCategories: (async (_req, res) => {
    const categories = await catalogService.getCategories();
    return sendSuccess(res, { categories });
  }) as RequestHandler,

  getCategoryBySlug: (async (req, res) => {
    const { slug } = req.params;
    const category = await catalogService.getCategoryBySlug(slug);
    return sendSuccess(res, { category });
  }) as RequestHandler<CategorySlugParamDto>,

  // ==================== Admin Category Handlers ====================

  getCategoryById: (async (req, res) => {
    const { id } = req.params;
    const category = await catalogService.getCategoryById(id);
    return sendSuccess(res, { category });
  }) as RequestHandler<CategoryIdParamDto>,

  createCategory: (async (req, res) => {
    const category = await catalogService.createCategory(req.body, req.user?.userId);
    return sendSuccess(res, { category }, 201);
  }) as RequestHandler<unknown, unknown, CreateCategoryDto>,

  updateCategory: (async (req, res) => {
    const { id } = req.params;
    const category = await catalogService.updateCategory(id, req.body, req.user?.userId);
    return sendSuccess(res, { category });
  }) as RequestHandler<CategoryIdParamDto, unknown, UpdateCategoryDto>,

  deleteCategory: (async (req, res) => {
    const { id } = req.params;
    await catalogService.deleteCategory(id, req.user?.userId);
    return sendSuccess(res, { message: translate(req.locale, 'success.categoryDeleted') });
  }) as RequestHandler<CategoryIdParamDto>,

  // ==================== Public Brand Handlers ====================

  getBrands: (async (_req, res) => {
    const brands = await catalogService.getBrands();
    return sendSuccess(res, { brands });
  }) as RequestHandler,

  getBrandBySlug: (async (req, res) => {
    const { slug } = req.params;
    const brand = await catalogService.getBrandBySlug(slug);
    return sendSuccess(res, { brand });
  }) as RequestHandler<BrandSlugParamDto>,

  // ==================== Admin Brand Handlers ====================

  getBrandById: (async (req, res) => {
    const { id } = req.params;
    const brand = await catalogService.getBrandById(id);
    return sendSuccess(res, { brand });
  }) as RequestHandler<BrandIdParamDto>,

  createBrand: (async (req, res) => {
    const brand = await catalogService.createBrand(req.body, req.user?.userId);
    return sendSuccess(res, { brand }, 201);
  }) as RequestHandler<unknown, unknown, CreateBrandDto>,

  updateBrand: (async (req, res) => {
    const { id } = req.params;
    const brand = await catalogService.updateBrand(id, req.body, req.user?.userId);
    return sendSuccess(res, { brand });
  }) as RequestHandler<BrandIdParamDto, unknown, UpdateBrandDto>,

  deleteBrand: (async (req, res) => {
    const { id } = req.params;
    await catalogService.deleteBrand(id, req.user?.userId);
    return sendSuccess(res, { message: translate(req.locale, 'success.brandDeleted') });
  }) as RequestHandler<BrandIdParamDto>,

  // ==================== Public Product Handlers ====================

  listPublicProducts: (async (req, res) => {
    const query = req.query as unknown as ListProductsQueryDto;
    const { products, total } = await catalogService.listPublicProducts(query);
    return sendPaginated(res, products, total, { page: query.page, pageSize: query.pageSize });
  }) as RequestHandler,

  getPublicProductBySlug: (async (req, res) => {
    const { slug } = req.params;
    const product = await catalogService.getPublicProductBySlug(slug);
    return sendSuccess(res, { product });
  }) as RequestHandler<ProductSlugParamDto>,

  // ==================== Admin Product Handlers ====================

  listAdminProducts: (async (req, res) => {
    const query = req.query as unknown as AdminListProductsQueryDto;
    const { products, total } = await catalogService.listAdminProducts(query);
    return sendPaginated(res, products, total, { page: query.page, pageSize: query.pageSize });
  }) as RequestHandler,

  getProductById: (async (req, res) => {
    const { id } = req.params;
    const product = await catalogService.getProductById(id);
    return sendSuccess(res, { product });
  }) as RequestHandler<ProductIdParamDto>,

  createProduct: (async (req, res) => {
    const product = await catalogService.createProduct(req.body, req.user?.userId);
    return sendSuccess(res, { product }, 201);
  }) as RequestHandler<unknown, unknown, CreateProductDto>,

  updateProduct: (async (req, res) => {
    const { id } = req.params;
    const product = await catalogService.updateProduct(id, req.body, req.user?.userId);
    return sendSuccess(res, { product });
  }) as RequestHandler<ProductIdParamDto, unknown, UpdateProductDto>,

  deleteProduct: (async (req, res) => {
    const { id } = req.params;
    await catalogService.deleteProduct(id, req.user?.userId);
    return sendSuccess(res, { message: translate(req.locale, 'success.productDeleted') });
  }) as RequestHandler<ProductIdParamDto>,

  // ==================== Variant Handlers ====================

  createVariant: (async (req, res) => {
    const variant = await catalogService.createVariant(req.body, req.user?.userId);
    return sendSuccess(res, { variant }, 201);
  }) as RequestHandler<unknown, unknown, CreateVariantDto>,

  updateVariant: (async (req, res) => {
    const { id } = req.params;
    const variant = await catalogService.updateVariant(id, req.body, req.user?.userId);
    return sendSuccess(res, { variant });
  }) as RequestHandler<VariantIdParamDto, unknown, UpdateVariantDto>,

  deleteVariant: (async (req, res) => {
    const { id } = req.params;
    await catalogService.deleteVariant(id, req.user?.userId);
    return sendSuccess(res, { message: translate(req.locale, 'success.variantDeleted') });
  }) as RequestHandler<VariantIdParamDto>,

  // ==================== Image Handlers ====================

  createImage: (async (req, res) => {
    const image = await catalogService.createImage(req.body);
    return sendSuccess(res, { image }, 201);
  }) as RequestHandler<unknown, unknown, CreateProductImageDto>,

  deleteImage: (async (req, res) => {
    const { id } = req.params;
    await catalogService.deleteImage(id);
    return sendSuccess(res, { message: translate(req.locale, 'success.imageDeleted') });
  }) as RequestHandler<ImageIdParamDto>,

  // ==================== Spec Handlers ====================

  createSpec: (async (req, res) => {
    const spec = await catalogService.createSpec(req.body);
    return sendSuccess(res, { spec }, 201);
  }) as RequestHandler<unknown, unknown, CreateProductSpecDto>,

  deleteSpec: (async (req, res) => {
    const { id } = req.params;
    await catalogService.deleteSpec(id);
    return sendSuccess(res, { message: translate(req.locale, 'success.specDeleted') });
  }) as RequestHandler<SpecIdParamDto>,
};
