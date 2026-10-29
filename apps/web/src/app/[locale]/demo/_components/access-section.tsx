'use client';

import { Box, Button, Stack, Typography } from '@mui/material';
import { DemoNote, DemoRow, DemoSection } from './demo-ui';

/**
 * Links to routes that trigger the access-control boundaries.
 *
 * `notFound()`, `forbidden()` and `unauthorized()` all work by throwing during
 * a server render, so they cannot be invoked from a click handler. Each one
 * gets a dedicated route under `/demo/access/*`.
 */
export function AccessSection() {
  return (
    <DemoSection
      id="access"
      title="Access boundaries (404 / 401 / 403)"
      description="Các route riêng gọi notFound(), unauthorized() và forbidden() trong lúc server render."
    >
      <Stack spacing={2}>
        <DemoRow label="notFound()">
          <Button
            size="small"
            variant="contained"
            component="a"
            href="/demo/access/not-found"
          >
            Mở trang 404
          </Button>
        </DemoRow>

        <DemoRow label="unauthorized()">
          <Button
            size="small"
            variant="contained"
            component="a"
            href="/demo/access/unauthorized"
          >
            Mở trang 401
          </Button>
        </DemoRow>

        <DemoRow label="forbidden()">
          <Button
            size="small"
            variant="contained"
            component="a"
            href="/demo/access/forbidden"
          >
            Mở trang 403
          </Button>
        </DemoRow>

        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Route lỗi cấp segment
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant="outlined"
              component="a"
              href="/demo/crash"
            >
              /demo/crash
            </Button>
            <Button
              size="small"
              variant="outlined"
              component="a"
              href="/demo/slow"
            >
              /demo/slow (loading.tsx)
            </Button>
          </Stack>
        </Box>

        <DemoNote>
          `forbidden()` và `unauthorized()` cần `experimental.authInterrupts:
          true` trong next.config.ts — thiếu thì Next sẽ báo lỗi build.
        </DemoNote>
      </Stack>
    </DemoSection>
  );
}
