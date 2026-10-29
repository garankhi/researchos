'use client';

import { useEffect } from 'react';
import { Box, Button, Container, Stack, Typography } from '@mui/material';
import { ErrorOutlined } from '@mui/icons-material';
import { useTranslations } from 'next-intl';

/**
 * Route-level error boundary.
 *
 * Catches uncaught errors thrown while rendering this route segment and its
 * children. Nested segments can define their own `error.tsx`; the nearest
 * boundary wins.
 *
 * `retry()` re-fetches and re-renders the segment's children. It is stable
 * since Next 16.3.0.
 *
 * This boundary does NOT wrap the segment's `layout.tsx` or `template.tsx`.
 * For a failure in the root layout itself, use `global-error.tsx`.
 *
 * Note the component is deliberately NOT named `Error`: a default export
 * named `Error` shadows the global `Error` constructor inside this module,
 * which breaks `instanceof Error` checks.
 */
export default function RouteError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const t = useTranslations('errors');

  useEffect(() => {
    // Replace with your error reporting service. In production the message
    // is stripped, so correlate using `error.digest` instead.
    console.error(error);
  }, [error]);

  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Stack
        spacing={2}
        role="alert"
        sx={{ alignItems: 'center', textAlign: 'center' }}
      >
        <ErrorOutlined color="error" sx={{ fontSize: 48 }} />
        <Typography variant="h5" component="h1" sx={{ fontWeight: 500 }}>
          {t('title')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('description')}
        </Typography>
        <Box>
          <Button variant="contained" onClick={() => retry()}>
            {t('retry')}
          </Button>
        </Box>
      </Stack>
    </Container>
  );
}
