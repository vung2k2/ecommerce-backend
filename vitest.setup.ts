process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL ??=
  'postgresql://ecommerce:ecommerce@127.0.0.1:5433/ecommerce_test?schema=public';
