import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/database/prisma.js';
import { catalogCache } from '../src/modules/catalog/catalog.cache.js';
import { catalogRepository } from '../src/modules/catalog/catalog.repository.js';
import { catalogService } from '../src/modules/catalog/catalog.service.js';

// Mock Redis client so no network calls are made
const { mockRedisGet, mockRedisSet, mockRedisScanStream, mockRedisDel } = vi.hoisted(() => ({
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
  mockRedisScanStream: vi.fn(),
  mockRedisDel: vi.fn(),
}));

vi.mock('../src/database/redis.js', () => ({
  getRedisClient: vi.fn().mockReturnValue({
    get: mockRedisGet,
    set: mockRedisSet,
    del: mockRedisDel,
    scanStream: mockRedisScanStream,
    duplicate: vi.fn().mockReturnValue({
      on: vi.fn(),
      status: 'ready',
    }),
  }),
}));

describe('Catalog Redis Caching & Invalidation Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockRedisGet.mockReset();
    mockRedisSet.mockReset();
    mockRedisScanStream.mockReset();
    mockRedisDel.mockReset();
  });

  describe('catalogCache helper resilience', () => {
    it('returns null when Redis get throws an error', async () => {
      mockRedisGet.mockRejectedValue(new Error('Redis connection down'));
      const result = await catalogCache.get('any-key');
      expect(result).toBeNull();
    });

    it('does not throw when Redis set fails', async () => {
      mockRedisSet.mockRejectedValue(new Error('Redis readonly'));
      await expect(catalogCache.set('any-key', { foo: 'bar' })).resolves.toBeUndefined();
    });

    it('invalidates matching keys via scanStream cleanly', async () => {
      const mockStream = {
        on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
          if (event === 'data') {
            const dataCb = callback as (keys: string[]) => void;
            dataCb(['catalog:categories:tree', 'catalog:categories:slug:laptop']);
          }
          if (event === 'end') {
            const endCb = callback as () => void;
            endCb();
          }
          return mockStream;
        }),
      };
      mockRedisScanStream.mockReturnValue(mockStream);
      mockRedisDel.mockResolvedValue(2);

      await catalogCache.invalidatePatterns('catalog:categories:*');

      expect(mockRedisScanStream).toHaveBeenCalledWith({
        match: 'catalog:categories:*',
        count: 100,
      });
      expect(mockRedisDel).toHaveBeenCalledWith([
        'catalog:categories:tree',
        'catalog:categories:slug:laptop',
      ]);
    });
  });

  describe('getCategories', () => {
    it('returns cached category tree on cache hit without querying database', async () => {
      const cachedTree = [{ id: 'cat-1', name: 'Laptops', slug: 'laptops', children: [] }];
      mockRedisGet.mockResolvedValue(JSON.stringify(cachedTree));
      const repoSpy = vi.spyOn(catalogRepository, 'findCategories');

      const result = await catalogService.getCategories();

      expect(result).toEqual(cachedTree);
      expect(repoSpy).not.toHaveBeenCalled();
      expect(mockRedisGet).toHaveBeenCalledWith('catalog:categories:tree');
    });

    it('queries database, formats tree, and saves to Redis on cache miss', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockRedisSet.mockResolvedValue('OK');
      const dbCategories = [
        { id: 'cat-1', name: 'Laptops', slug: 'laptops', parentId: null, description: null },
      ];
      vi.spyOn(catalogRepository, 'findCategories').mockResolvedValue(dbCategories as never);

      const result = await catalogService.getCategories();

      expect(result).toEqual([
        {
          id: 'cat-1',
          name: 'Laptops',
          slug: 'laptops',
          parentId: null,
          description: null,
          children: [],
        },
      ]);
      expect(mockRedisSet).toHaveBeenCalledWith(
        'catalog:categories:tree',
        expect.any(String),
        'EX',
        3600,
      );
    });
  });

  describe('getCategoryBySlug', () => {
    it('returns cached category on cache hit', async () => {
      const cachedCategory = { id: 'cat-1', name: 'Phones', slug: 'phones' };
      mockRedisGet.mockResolvedValue(JSON.stringify(cachedCategory));
      const repoSpy = vi.spyOn(catalogRepository, 'findCategoryBySlug');

      const result = await catalogService.getCategoryBySlug('phones');

      expect(result).toEqual(cachedCategory);
      expect(repoSpy).not.toHaveBeenCalled();
      expect(mockRedisGet).toHaveBeenCalledWith('catalog:categories:slug:phones');
    });

    it('queries repository and caches on cache miss', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockRedisSet.mockResolvedValue('OK');
      const dbCategory = { id: 'cat-1', name: 'Phones', slug: 'phones' };
      vi.spyOn(catalogRepository, 'findCategoryBySlug').mockResolvedValue(dbCategory as never);

      const result = await catalogService.getCategoryBySlug('phones');

      expect(result).toEqual(dbCategory);
      expect(mockRedisSet).toHaveBeenCalledWith(
        'catalog:categories:slug:phones',
        JSON.stringify(dbCategory),
        'EX',
        3600,
      );
    });
  });

  describe('getBrands & getBrandBySlug', () => {
    it('returns cached brands list on cache hit', async () => {
      const cachedBrands = [{ id: 'brand-1', name: 'Apple', slug: 'apple' }];
      mockRedisGet.mockResolvedValue(JSON.stringify(cachedBrands));
      const repoSpy = vi.spyOn(catalogRepository, 'findBrands');

      const result = await catalogService.getBrands();

      expect(result).toEqual(cachedBrands);
      expect(repoSpy).not.toHaveBeenCalled();
      expect(mockRedisGet).toHaveBeenCalledWith('catalog:brands:all');
    });

    it('returns cached brand by slug on cache hit', async () => {
      const cachedBrand = { id: 'brand-1', name: 'Apple', slug: 'apple' };
      mockRedisGet.mockResolvedValue(JSON.stringify(cachedBrand));
      const repoSpy = vi.spyOn(catalogRepository, 'findBrandBySlug');

      const result = await catalogService.getBrandBySlug('apple');

      expect(result).toEqual(cachedBrand);
      expect(repoSpy).not.toHaveBeenCalled();
      expect(mockRedisGet).toHaveBeenCalledWith('catalog:brands:slug:apple');
    });
  });

  describe('listPublicProducts & getPublicProductBySlug', () => {
    it('returns cached product list on cache hit', async () => {
      const cachedResult = { products: [{ id: 'prod-1', name: 'MacBook Pro' }], total: 1 };
      mockRedisGet.mockResolvedValue(JSON.stringify(cachedResult));
      const repoSpy = vi.spyOn(catalogRepository, 'findPublicProducts');

      const result = await catalogService.listPublicProducts({
        page: 1,
        pageSize: 10,
        sortBy: 'createdAt_desc',
      });

      expect(result).toEqual(cachedResult);
      expect(repoSpy).not.toHaveBeenCalled();
    });

    it('returns cached product detail by slug on cache hit', async () => {
      const cachedProduct = { id: 'prod-1', name: 'MacBook Pro', slug: 'macbook-pro' };
      mockRedisGet.mockResolvedValue(JSON.stringify(cachedProduct));
      const repoSpy = vi.spyOn(catalogRepository, 'findPublicProductBySlug');

      const result = await catalogService.getPublicProductBySlug('macbook-pro');

      expect(result).toEqual(cachedProduct);
      expect(repoSpy).not.toHaveBeenCalled();
      expect(mockRedisGet).toHaveBeenCalledWith('catalog:products:slug:macbook-pro');
    });
  });

  describe('Cache Invalidation on Mutations', () => {
    it('invalidates categories and products cache when creating category', async () => {
      const invalidateSpy = vi.spyOn(catalogCache, 'invalidatePatterns').mockResolvedValue();
      vi.spyOn(catalogRepository, 'findCategoryBySlug').mockResolvedValue(null);
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
        return callback({} as never);
      });
      vi.spyOn(catalogRepository, 'createCategory').mockResolvedValue({
        id: 'cat-new',
        name: 'Smart Watches',
        slug: 'smart-watches',
      } as never);

      await catalogService.createCategory({ name: 'Smart Watches' });

      expect(invalidateSpy).toHaveBeenCalledWith('catalog:categories:*', 'catalog:products:*');
    });

    it('invalidates brands and products cache when creating brand', async () => {
      const invalidateSpy = vi.spyOn(catalogCache, 'invalidatePatterns').mockResolvedValue();
      vi.spyOn(catalogRepository, 'findBrandBySlug').mockResolvedValue(null);
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
        return callback({} as never);
      });
      vi.spyOn(catalogRepository, 'createBrand').mockResolvedValue({
        id: 'brand-new',
        name: 'Sony',
        slug: 'sony',
      } as never);

      await catalogService.createBrand({ name: 'Sony' });

      expect(invalidateSpy).toHaveBeenCalledWith('catalog:brands:*', 'catalog:products:*');
    });

    it('invalidates products cache when creating product', async () => {
      const invalidateSpy = vi.spyOn(catalogCache, 'invalidatePatterns').mockResolvedValue();
      vi.spyOn(catalogRepository, 'findCategoryById').mockResolvedValue({ id: 'cat-1' } as never);
      vi.spyOn(catalogRepository, 'findProductBySlug').mockResolvedValue(null);
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
        return callback({} as never);
      });
      vi.spyOn(catalogRepository, 'createProductWithDetails').mockResolvedValue({
        id: 'prod-1',
        name: 'Headphones',
        slug: 'headphones',
      } as never);

      await catalogService.createProduct({
        name: 'Headphones',
        categoryId: 'cat-1',
        status: 'ACTIVE',
        specifications: [],
        variants: [],
      });

      expect(invalidateSpy).toHaveBeenCalledWith('catalog:products:*');
    });

    it('invalidates products cache when creating a variant', async () => {
      const invalidateSpy = vi.spyOn(catalogCache, 'invalidatePatterns').mockResolvedValue();
      vi.spyOn(catalogRepository, 'findProductById').mockResolvedValue({ id: 'prod-1' } as never);
      vi.spyOn(catalogRepository, 'findVariantBySku').mockResolvedValue(null);
      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback) => {
        return callback({} as never);
      });
      vi.spyOn(catalogRepository, 'createVariant').mockResolvedValue({
        id: 'var-1',
        sku: 'HP-BLK',
        name: 'Black',
      } as never);

      await catalogService.createVariant('prod-1', {
        sku: 'HP-BLK',
        name: 'Black',
        price: 1500000n,
        isActive: true,
      });

      expect(invalidateSpy).toHaveBeenCalledWith('catalog:products:*');
    });

    it('invalidates products cache when deleting a specification', async () => {
      const invalidateSpy = vi.spyOn(catalogCache, 'invalidatePatterns').mockResolvedValue();
      vi.spyOn(catalogRepository, 'findSpecById').mockResolvedValue({ id: 'spec-1' } as never);
      vi.spyOn(catalogRepository, 'deleteSpec').mockResolvedValue({} as never);

      await catalogService.deleteSpec('spec-1');

      expect(invalidateSpy).toHaveBeenCalledWith('catalog:products:*');
    });
  });
});
