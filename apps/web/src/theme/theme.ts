import {
  createSystem,
  defaultConfig,
  defineConfig,
  type SystemStyleObject,
} from '@chakra-ui/react';

const bodyFont = 'var(--font-inter, Inter), system-ui, sans-serif';
const headingFont = `var(--font-manrope, Manrope), ${bodyFont}`;

const highlightedRow: SystemStyleObject = {
  bg: 'interactiveRow.highlight',
  _before: {
    content: '""',
    position: 'absolute',
    insetBlock: '0',
    insetInlineStart: '0',
    width: '2px',
    bg: 'interactiveRow.indicator',
    pointerEvents: 'none',
    '@media (forced-colors: active)': {
      bg: 'Highlight',
      forcedColorAdjust: 'none',
    },
  },
};

const config = defineConfig({
  theme: {
    semanticTokens: {
      colors: {
        home: {
          background: { value: { base: '#f6f6f6', _dark: '{colors.bg}' } },
        },
        // Chakra's default `fg.error` is `red.500`, which reaches only
        // 3.76:1 against white — below the 4.5:1 that WCAG AA asks of
        // body text. The error text is the one place a form states what
        // went wrong, so it has to be readable, not merely red.
        //
        // The condition key is `_light`, not `base`: a partial override of
        // an existing namespace only applies when it uses the same
        // condition key as the token it replaces.
        fg: {
          error: { value: { _light: '#b91c1c', _dark: '#f87171' } },
        },
        interactiveRow: {
          highlight: { value: { base: '#e8e8e8', _dark: '#303034' } },
          indicator: { value: { base: '#737373', _dark: '#a1a1aa' } },
        },
        drawerBackdrop: {
          value: {
            base: 'rgba(232, 232, 232, 0.92)',
            _dark: 'rgba(0, 0, 0, 0.68)',
          },
        },
        blue: {
          solid: { value: '#006DD9' },
          solidHover: { value: '#003971' },
        },
        researchAccessAccent: { value: '#006DD9' },
      },
      shadows: {
        overlayPanel: {
          value: {
            base: '0 4px 12px rgba(0, 0, 0, 0.14), 0 1px 4px rgba(0, 0, 0, 0.08)',
            _dark:
              '0 4px 16px rgba(0, 0, 0, 0.55), 0 1px 4px rgba(0, 0, 0, 0.32)',
          },
        },
      },
    },
    layerStyles: {
      interactiveRow: {
        value: {
          position: 'relative',
          '&:not(:disabled, [data-disabled], [aria-disabled="true"])': {
            _hover: highlightedRow,
            _focusVisible: highlightedRow,
            _highlighted: highlightedRow,
          },
        },
      },
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
    recipes: {
      button: {
        variants: {
          variant: {
            solid: {
              colorPalette: 'blue',
              _hover: { bg: 'blue.solidHover' },
              _active: { bg: 'blue.solidHover' },
              _expanded: { bg: 'blue.solidHover' },
            },
          },
        },
      },
    },
    tokens: {
      radii: {
        '2xs': { value: '0' },
        xs: { value: '0' },
        sm: { value: '0' },
        md: { value: '0' },
        lg: { value: '0' },
        xl: { value: '0' },
        '2xl': { value: '0' },
        '3xl': { value: '0' },
        '4xl': { value: '0' },
        full: { value: '0' },
      },
      fonts: {
        body: { value: bodyFont },
        heading: { value: headingFont },
        mono: { value: 'var(--font-geist-mono, monospace)' },
        sans: { value: bodyFont },
      },
    },
  },
  globalCss: {
    html: { minHeight: '100%' },
    body: {
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      colorPalette: 'gray',
    },
  },
});

export const system = createSystem(defaultConfig, config);
