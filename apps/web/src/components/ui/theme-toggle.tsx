'use client';

import * as React from 'react';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';

const subscribe = () => () => {};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const t = useTranslations('theme');

  // false on the server and during hydration, true afterwards
  const mounted = React.useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  if (!mounted) {
    // Same markup on server and first client render, same size as the real button
    return (
      <IconButton color="inherit" aria-label={t('label')} disabled>
        <DarkModeIcon sx={{ visibility: 'hidden' }} />
      </IconButton>
    );
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <Tooltip title={isDark ? t('lightMode') : t('darkMode')}>
      <IconButton
        color="inherit"
        aria-label={isDark ? t('toLight') : t('toDark')}
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
      >
        {isDark ? <LightModeIcon /> : <DarkModeIcon />}
      </IconButton>
    </Tooltip>
  );
}

export default ThemeToggle;
