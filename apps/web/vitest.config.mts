import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Resolves the path aliases declared in tsconfig.json — `@/*` → `src/*`.
    // Requires Vite 8, which ships this option.
    tsconfigPaths: true,
    alias: {
      // The shared error-code contract is a workspace package with a
      // compiled `dist/`. Pointing the alias at its source means the web
      // test runner does not need that package built first, so
      // `pnpm --filter web test` works on a fresh checkout.
      '@researchos/error-codes': fileURLToPath(
        new URL('../../packages/error-codes/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts', '**/*.spec.tsx'],
    // The specs cover pure logic — the envelope unwrapping, the error
    // helpers and the catalog resolution. None of them render, so the
    // default node environment is enough and the suite stays fast.
    environment: 'node',
  },
});
