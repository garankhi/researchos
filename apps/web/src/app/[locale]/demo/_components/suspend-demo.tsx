import { io } from 'next/cache';
import { setTimeout } from 'node:timers/promises';
import { Chip, Stack, Typography } from '@mui/material';

/**
 * Suspends for two seconds so the surrounding `<Suspense>` fallback is
 * observable.
 *
 * `io()` keeps the value out of the static shell, so the component resolves
 * per request instead of being prerendered with a finished value.
 */
export async function SuspendDemo() {
  await io();
  await setTimeout(2000);

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <Chip label="đã tải xong" color="success" size="small" />
      <Typography variant="body2">
        Component server đã resolve sau 2 giây.
      </Typography>
    </Stack>
  );
}
