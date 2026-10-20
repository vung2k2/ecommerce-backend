import { createHash } from 'node:crypto';
import { logger } from '../../config/logger.js';
import { getRedisClient } from '../../database/redis.js';

export const CATALOG_CACHE_TTL = 3600; // 1 hour default TTL

export const catalogCache = {
  keys: {
    categoriesTree: () => 'catalog:categories:tree',
    categorySlug: (slug: string) => `catalog:categories:slug:${slug}`,
    brandsAll: () => 'catalog:brands:all',
    brandSlug: (slug: string) => `catalog:brands:slug:${slug}`,
    productSlug: (slug: string) => `catalog:products:slug:${slug}`,
    productsList: (query: Record<string, unknown>) => {
      const serialized = JSON.stringify(query, Object.keys(query).sort());
      const hash = createHash('md5').update(serialized).digest('hex');
      return `catalog:products:list:${hash}`;
    },
  },

  patterns: {
    categories: 'catalog:categories:*',
    brands: 'catalog:brands:*',
    products: 'catalog:products:*',
  },

  async get<T>(key: string): Promise<T | null> {
    try {
      const client = getRedisClient();
      const raw = await client.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (error) {
      logger.warn({ error, key }, 'Catalog cache GET failed, falling back to database');
      return null;
    }
  },

  async set(key: string, data: unknown, ttlSeconds = CATALOG_CACHE_TTL): Promise<void> {
    try {
      const client = getRedisClient();
      await client.set(key, JSON.stringify(data), 'EX', ttlSeconds);
    } catch (error) {
      logger.warn({ error, key }, 'Catalog cache SET failed');
    }
  },

  async invalidatePatterns(...patterns: string[]): Promise<void> {
    try {
      const client = getRedisClient();
      for (const pattern of patterns) {
        const stream = client.scanStream({ match: pattern, count: 100 });
        const keysToDelete: string[] = [];

        await new Promise<void>((resolve) => {
          stream.on('data', (keys: string[]) => {
            if (keys.length > 0) keysToDelete.push(...keys);
          });
          stream.on('end', () => {
            if (keysToDelete.length > 0) {
              client
                .del(keysToDelete)
                .catch(() => {})
                .finally(() => resolve());
            } else {
              resolve();
            }
          });
          stream.on('error', (err) => {
            logger.warn({ err, pattern }, 'Error scanning cache keys to invalidate');
            resolve();
          });
        });
      }
    } catch (error) {
      logger.warn({ error, patterns }, 'Catalog cache invalidation failed');
    }
  },
};
