'use client';

import { useSyncExternalStore } from 'react';
import { Box, Button, Chip, Stack, Switch, Typography } from '@mui/material';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { DemoNote, DemoRow, DemoSection } from './demo-ui';

/**
 * Subscribes to the `class` attribute on <html>.
 *
 * `useSyncExternalStore` is used instead of an effect + setState because the
 * value lives outside React: reading it during render must also produce the
 * same result on the server, where there is no document.
 */
function useHtmlClass(): string {
  return useSyncExternalStore(
    (onChange) => {
      const observer = new MutationObserver(onChange);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      });
      return () => observer.disconnect();
    },
    () => document.documentElement.className,
    () => '',
  );
}

/**
 * Reports whether the client has hydrated.
 *
 * The server snapshot differs from the client snapshot, so React re-renders
 * the component after hydration. That re-render is the signal used here to
 * read values that only exist in the browser.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
}

/**
 * Verifies the next-themes -> MUI color scheme bridge.
 *
 * `theme-provider.tsx` syncs `resolvedTheme` into MUI's `useColorScheme`. If
 * that bridge breaks, MUI components keep the light palette while the page
 * background goes dark — the readout below compares the DOM class against
 * next-themes' own idea of the active scheme.
 *
 * The theme is only read after mount. next-themes cannot know the resolved
 * theme during SSR (it depends on the client preference and the OS setting),
 * so reading it earlier would make the server and client render different
 * text and trip a hydration mismatch.
 */
export function ThemeSection() {
  const t = useTranslations('demo');
  const { resolvedTheme, theme, setTheme } = useTheme();
  const htmlClass = useHtmlClass();
  const hydrated = useHydrated();

  return (
    <DemoSection
      id="theme"
      title={t('sections.theme.title')}
      description={t('sections.theme.description')}
    >
      <Stack spacing={2}>
        <DemoRow label={t('labels.themeSwitcher')}>
          <Button
            size="small"
            variant="contained"
            onClick={() => setTheme('light')}
          >
            {t('labels.light')}
          </Button>
          <Button
            size="small"
            variant="contained"
            onClick={() => setTheme('dark')}
          >
            {t('labels.dark')}
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={() => setTheme('system')}
          >
            {t('labels.system')}
          </Button>
        </DemoRow>

        <DemoRow label={t('labels.systemPreference')}>
          <Switch
            checked={
              hydrated ? theme === 'system' || theme === undefined : false
            }
            onChange={() => setTheme('system')}
            color="primary"
          />
          <Typography variant="body2" color="text.secondary">
            {t('labels.followSystem')}
          </Typography>
        </DemoRow>

        <Box>
          <DemoRow label={t('labels.state')}>
            <Chip
              label={t('theme.htmlClass', {
                value: htmlClass || t('theme.htmlClassEmpty'),
              })}
              size="small"
              variant="outlined"
            />
            <Chip
              label={
                hydrated
                  ? t('theme.nextThemesResolved', {
                      value: resolvedTheme ?? t('theme.nextThemesUnresolved'),
                    })
                  : t('theme.nextThemesMounting')
              }
              size="small"
              variant="outlined"
            />
          </DemoRow>
          <DemoNote>
            {hydrated ? t('notes.themeBridge') : t('notes.themeHydrating')}
          </DemoNote>
        </Box>
      </Stack>
    </DemoSection>
  );
}
