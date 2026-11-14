import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react';

const config = defineConfig({
  theme: {
    tokens: {
      fonts: {
        body: { value: 'var(--font-geist-sans), system-ui, sans-serif' },
        heading: { value: 'var(--font-geist-sans, system-ui), sans-serif' },
        mono: { value: 'var(--font-geist-mono, monospace)' },
      },
    },
  },
  globalCss: {
    html: { minHeight: '100%' },
    body: {
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      colorPalette: 'blue',
    },
  },
});

export const system = createSystem(defaultConfig, config);
