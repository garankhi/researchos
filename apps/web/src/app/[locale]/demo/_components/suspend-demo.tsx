import { io } from 'next/cache';
import { setTimeout } from 'node:timers/promises';
import { Chip, Stack, Typography } from '@mui/material';
import { getTranslations } from 'next-intl/server';

/**
 * Suspends for two seconds so the surrounding `<Suspense>` fallback is
 * observable.
 *
 * `io()` keeps the value out of the static shell, so the component resolves
 * per request instead of being prerendered with a finished value.
 */
export async function SuspendDemo() {
  const t = await getTranslations('demo');

  await io();
  await setTimeout(2000);

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <Chip label={t('states.loaded')} color="success" size="small" />
      <Typography variant="body2">
        {t('states.resolvedAfter', { seconds: 2 })}
      </Typography>
    </Stack>
  );
}
