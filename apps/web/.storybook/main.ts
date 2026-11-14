import type { StorybookConfig } from '@storybook/nextjs-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-a11y', '@storybook/addon-vitest'],
  framework: '@storybook/nextjs-vite',
  staticDirs: ['../public'],
  viteFinal(config) {
    config.optimizeDeps ??= {};
    config.optimizeDeps.include = [
      ...(config.optimizeDeps.include ?? []),
      'next-intl/navigation',
    ];
    return config;
  },
};

export default config;
