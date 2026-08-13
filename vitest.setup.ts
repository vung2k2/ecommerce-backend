process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL ??=
  'postgresql://ecommerce:ecommerce@127.0.0.1:5433/ecommerce_test?schema=public';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-that-is-at-least-32-characters';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-that-is-at-least-32-characters';
