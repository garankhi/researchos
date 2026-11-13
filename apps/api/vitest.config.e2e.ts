import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.{ts,mjs}'],
    // The queue e2e waits for a worker to start and for a Redis failure to
    // be noticed, so it needs more than the 5s default. The queue-specific
    // config sets the same budget.
    hookTimeout: 30_000,
    testTimeout: 30_000,
    // The queue spec binds a port and drives a standalone worker, so the
    // files cannot run side by side.
    fileParallelism: false,
  },
});
