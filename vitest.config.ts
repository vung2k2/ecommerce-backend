import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    restoreMocks: true,
    fileParallelism: false,
  },
});
