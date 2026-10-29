'use client';

import { createTheme } from '@mui/material/styles';

/**
 * ResearchOS theme.
 *
 * `cssVariables` + `colorSchemes` are required, not optional:
 * - `cssVariables` lets MUI emit theme values as CSS custom properties, so
 *   Tailwind utilities and MUI components read from the same source.
 * - `colorSchemes: { dark: true }` enables MUI's light/dark palettes.
 * - `colorSchemeSelector: 'class'` means the active scheme is driven by a
 *   class on <html>, which is what next-themes writes. Using the default
 *   'media' selector would make MUI ignore the user's stored preference.
 *
 * See `src/components/providers/theme-provider.tsx` for how the class is applied.
 */
export const theme = createTheme({
  colorSchemes: {
    dark: true,
  },
  cssVariables: {
    colorSchemeSelector: 'class',
  },
  typography: {
    fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
    },
    MuiLink: {
      defaultProps: {
        underline: 'hover',
      },
    },
  },
});

export default theme;
