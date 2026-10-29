'use client';

import { useEffect } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import NextLink from '@/components/ui/link';
/**
 * Error boundary for the `/demo` segment.
 *
 * Scoping it to `/demo` means a crash in the demo routes does not take down
 * the rest of the app. The `retry()` action re-renders the segment.
 */
export default function DemoError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const message =
    error instanceof Error ? error.message : 'Đã xảy ra lỗi không xác định.';
  const digest =
    error && typeof error === 'object' && 'digest' in error
      ? String((error as { digest?: unknown }).digest)
      : undefined;

  return (
    <Box className="mx-auto w-full max-w-5xl px-4 py-8">
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
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Lỗi trong phần demo
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {message}
          </Typography>
          {digest ? (
            <Typography variant="caption" color="text.tertiary">
              digest: {digest}
            </Typography>
          ) : null}
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={() => retry()}>
              Thử lại
            </Button>
            <Button variant="outlined" component={NextLink} href="/demo">
              Về trang demo
            </Button>
          </Stack>
        </Stack>
      </Box>
    </Box>
  );
}
