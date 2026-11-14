'use client';

import { ClientOnly, IconButton } from '@chakra-ui/react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const t = useTranslations('theme');
  const isDark = resolvedTheme === 'dark';
  const label = t(isDark ? 'toLight' : 'toDark');

  return (
    <ClientOnly
      fallback={<IconButton variant="ghost" aria-label={t('label')} disabled />}
    >
      <IconButton
        variant="ghost"
        aria-label={label}
        title={label}
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
      >
        {isDark ? <Sun /> : <Moon />}
      </IconButton>
    </ClientOnly>
  );
}
