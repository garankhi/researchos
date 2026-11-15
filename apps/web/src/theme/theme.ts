import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react';

const config = defineConfig({
  theme: {
    semanticTokens: {
      colors: {
        researchAccessAccent: { value: '#006DD9' },
      },
    },
    layerStyles: {
      researchAccess: {
        value: {
          borderRadius: '9999px',
          fontFamily: 'body',
          fontSize: 'sm',
          fontWeight: 'normal',
          px: '3.5',
          bg: 'white',
          borderColor: 'researchAccessAccent',
          color: 'researchAccessAccent',
          textDecoration: 'none',
          _hover: { bg: 'researchAccessAccent', color: 'white' },
        },
      },
      researchTextLink: {
        value: {
          color: { base: '#000', _dark: 'fg' },
          _hover: {
            textDecoration: 'underline',
            textDecorationColor: 'currentColor',
            textUnderlineOffset: '3px',
          },
          _focusVisible: {
            textDecoration: 'underline',
            textDecorationColor: 'currentColor',
            textUnderlineOffset: '3px',
          },
        },
      },
    },
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
