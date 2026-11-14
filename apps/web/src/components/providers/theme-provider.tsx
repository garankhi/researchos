'use client';

import { ChakraProvider } from '@chakra-ui/react';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { system } from '@/theme/theme';

export function ChakraThemeProvider({ children }: { children: ReactNode }) {
  return <ChakraProvider value={system}>{children}</ChakraProvider>;
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ChakraThemeProvider>
      <ThemeProvider attribute="class" disableTransitionOnChange>
        {children}
      </ThemeProvider>
    </ChakraThemeProvider>
  );
}
