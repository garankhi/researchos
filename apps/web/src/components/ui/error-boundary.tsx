'use client';

import { useEffect } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { ErrorOutlined } from '@mui/icons-material';
import { catchError, type ErrorInfo } from 'next/error';
import { useTranslations } from 'next-intl';

/**
 * Component-level error boundary for ResearchOS.
 *
 * `catchError` (stable since Next 16.3) is preferred over a hand-rolled
 * error boundary class because it:
 * - re-renders inside a Transition, so Client Component state outside the
 *   boundary survives a recoverable error;
 * - lets `redirect()` and `notFound()` pass through instead of swallowing
 *   them as generic failures;
 * - clears the error state on client navigation.
 *
 * Usage:
 *   <ErrorBoundary title="..."><SomeWidget /></ErrorBoundary>
 *
 * Note this is for component-level recovery. Route-level failures belong in
 * `app/error.tsx`, which renders inside Next's own boundary.
 */

function ErrorFallback(
  { title, message }: { title: string; message?: string },
  { error, retry }: ErrorInfo,
) {
  const t = useTranslations('common');

  useEffect(() => {
    // Replace with your error reporting service. `error.digest` correlates
    // a production error with the server-side log entry.
    console.error(error);
  }, [error]);

  return (
    <Box
      role="alert"
      sx={{
        p: 3,
        border: 1,
        borderColor: 'error.main',
        borderRadius: 1,
      }}
    >
      <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <ErrorOutlined color="error" fontSize="small" />
          <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
            {title}
          </Typography>
        </Stack>
        {message ? (
          <Typography variant="body2" color="text.secondary">
            {message}
          </Typography>
        ) : null}
        <Button variant="outlined" size="small" onClick={() => retry()}>
          {t('retry')}
        </Button>
      </Stack>
    </Box>
  );
}

export default catchError(ErrorFallback);
