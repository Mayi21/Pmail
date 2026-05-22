import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'miniflare',
    environmentOptions: {
      // Miniflare-specific options
      modules: true,
      scriptPath: './src/index.ts',
      durableObjects: {},
      kvNamespaces: ['TEST_KV'],
      d1Databases: ['TEST_DB'],
      r2Buckets: ['TEST_BUCKET'],
      queueProducers: {
        TEST_QUEUE: {
          queueName: 'test-queue',
        },
      },
    },
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'test/',
        '*.config.ts',
      ],
    },
  },
});