'use client';

import { ThemeProvider, useColorScheme } from '@mui/material/styles';
import {
  ThemeProvider as NextThemesProvider,
  useTheme as useNextThemes,
} from 'next-themes';
import { useEffect, type ReactNode } from 'react';
import { theme } from '@/theme/theme';

/**
 * Bridges next-themes to MUI.
 *
 * next-themes owns the user's light/dark preference, persists it and writes
 * the `class` attribute on <html>. MUI's `useColorScheme` keeps its own
 * internal state, so without this sync MUI would still believe it is in
 * light mode while the DOM renders the dark palette.
 */
function MuiThemeSyncer() {
  const { setMode } = useColorScheme();
  const { resolvedTheme } = useNextThemes();

  useEffect(() => {
    setMode(resolvedTheme === 'dark' ? 'dark' : 'light');
  }, [resolvedTheme, setMode]);

  return null;
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <ThemeProvider theme={theme}>
        <MuiThemeSyncer />
        {children}
      </ThemeProvider>
    </NextThemesProvider>
  );
}
