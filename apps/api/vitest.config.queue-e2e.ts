import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: [
      'test/queue.e2e-spec.ts',
      'test/durable-jobs.e2e-spec.ts',
      'test/digest-sender.e2e-spec.ts',
      'test/research-updates.e2e-spec.mjs',
    ],
    hookTimeout: 30_000,
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
