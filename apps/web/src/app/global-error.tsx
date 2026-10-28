'use client';

import { useEffect } from 'react';
import { Box, Button, Container, Stack, Typography } from '@mui/material';

/**
 * Global error boundary.
 *
 * Replaces the root layout entirely when the root layout itself fails, so
 * this component MUST render its own <html> and <body> tags. It also does
 * not inherit global styles, so the theme toggle class on <html> is not
 * applied here.
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
    <html lang="en">
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
        <Container maxWidth="sm">
          <Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center' }}>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 500 }}>
              Ứng dụng gặp sự cố
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Đã xảy ra lỗi không mong muốn. Vui lòng tải lại trang hoặc thử
              lại.
            </Typography>
            <Box>
              <Button variant="contained" onClick={() => retry()}>
                Thử lại
              </Button>
            </Box>
          </Stack>
        </Container>
      </body>
    </html>
  );
}
