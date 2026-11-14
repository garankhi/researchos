import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: 'node_modules/.vite-storybook-test',
  plugins: [
    storybookTest({
      configDir: fileURLToPath(new URL('.', import.meta.url)),
      storybookScript: 'pnpm storybook',
    }),
  ],
  test: {
    name: 'storybook',
    browser: {
      enabled: true,
      headless: true,
      // Windows can reserve Vitest's default port (63315) for Hyper-V.
      api: { host: '127.0.0.1', port: 6010 },
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
});
