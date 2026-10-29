'use client';

import { useEffect } from 'react';
import { Box, Button, Container, Stack, Typography } from '@mui/material';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import messages from '@/messages/vi.json';
import { routing } from '@/i18n/routing';

/**
 * Global error boundary.
 *
 * Replaces the root layout entirely when the root layout itself fails, so
 * this component MUST render its own <html> and <body> tags. It also does
 * not inherit global styles, so the theme toggle class on <html> is not
 * applied here.
 *
 * Because the root layout is replaced, the `NextIntlClientProvider` from
 * the layout is gone too. This component mounts its own provider so the
 * copy is still readable instead of showing raw message ids.
 *
 * The provider uses the default locale: the root layout that owns the
 * `[locale]` segment is exactly what failed, so the active locale cannot be
 * read from here.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    // Replace with your error reporting service.
    console.error(error);
  }, [error]);

  return (
    <html lang={routing.defaultLocale}>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <NextIntlClientProvider locale={routing.defaultLocale} messages={messages}>
          <GlobalErrorCopy onRetry={() => retry()} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

/**
 * The copy of the global error state.
 *
 * Split into its own component because `useTranslations` is a hook and
 * cannot be called in the same component that provides the context.
 */
function GlobalErrorCopy({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('errors');
  const tCommon = useTranslations('common');

  return (
    <Container maxWidth="sm">
      <Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center' }}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 500 }}>
          {t('globalTitle')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('globalDescription')}
        </Typography>
        <Box>
          <Button variant="contained" onClick={onRetry}>
            {tCommon('retry')}
          </Button>
        </Box>
      </Stack>
    </Container>
  );
}
