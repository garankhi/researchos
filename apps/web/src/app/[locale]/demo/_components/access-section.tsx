'use client';

import { Box, Button, Stack, Typography } from '@mui/material';
import { useTranslations } from 'next-intl';
import { DemoNote, DemoRow, DemoSection } from './demo-ui';

/**
 * Links to routes that trigger the access-control boundaries.
 *
 * `notFound()`, `forbidden()` and `unauthorized()` all work by throwing during
 * a server render, so they cannot be invoked from a click handler. Each one
 * gets a dedicated route under `/demo/access/*`.
 */
export function AccessSection() {
  const t = useTranslations('demo');

  return (
    <DemoSection
      id="access"
      title={t('sections.access.title')}
      description={t('sections.access.description')}
    >
      <Stack spacing={2}>
        <DemoRow label="notFound()">
          <Button
            size="small"
            variant="contained"
            component="a"
            href="/demo/access/not-found"
          >
            {t('actions.openRouteError')}
          </Button>
        </DemoRow>

        <DemoRow label="unauthorized()">
          <Button
            size="small"
            variant="contained"
            component="a"
            href="/demo/access/unauthorized"
          >
            {t('actions.openRouteError')}
          </Button>
        </DemoRow>

        <DemoRow label="forbidden()">
          <Button
            size="small"
            variant="contained"
            component="a"
            href="/demo/access/forbidden"
          >
            {t('actions.openRouteError')}
          </Button>
        </DemoRow>

        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {t('labels.segmentError')}
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

        <DemoNote>{t('notes.authInterrupts')}</DemoNote>
      </Stack>
    </DemoSection>
  );
}
