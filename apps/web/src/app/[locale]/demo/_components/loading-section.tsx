'use client';

import { useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { useTranslations } from 'next-intl';
import {
  EmptyState,
  ListItemSkeleton,
  LoadingSkeleton,
} from '@/components/ui/feedback';
import { DemoNote, DemoRow, DemoSection } from './demo-ui';

/**
 * Exercises the shared loading primitives.
 *
 * The real loading state is driven by the API section; here the same
 * primitives are rendered statically so their shape can be reviewed in
 * isolation.
 */
export function LoadingSection() {
  const t = useTranslations('demo');
  const [hidden, setHidden] = useState(false);

  return (
    <DemoSection
      id="loading"
      title={t('sections.loading.title')}
      description={t('sections.loading.description')}
    >
      <Stack spacing={3}>
        <Box>
          <DemoRow label={t('labels.text')}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setHidden((v) => !v)}
            >
              {hidden ? t('loading.show') : t('loading.hide')}
            </Button>
          </DemoRow>
          <Box sx={{ mt: 1.5 }}>
            {hidden ? (
              <Typography variant="body2" color="text.secondary">
                {t('loading.hidden')}
              </Typography>
            ) : (
              <>
                <LoadingSkeleton width={220} />
                <Box sx={{ mt: 1 }}>
                  <LoadingSkeleton variant="text" width="70%" />
                </Box>
              </>
            )}
          </Box>
        </Box>

        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {t('loading.rectangularCircular')}
          </Typography>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <LoadingSkeleton variant="rectangular" width={160} height={72} />
            <LoadingSkeleton variant="circular" width={56} height={56} />
          </Stack>
        </Box>

        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {t('loading.multipleLines')}
          </Typography>
          <LoadingSkeleton count={4} />
        </Box>

        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {t('loading.listItem')}
          </Typography>
          <ListItemSkeleton />
        </Box>

        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {t('loading.emptyState')}
          </Typography>
          <EmptyState
            title={t('loading.emptyTitle')}
            message={t('loading.emptyMessage')}
            action={
              <Button size="small" variant="outlined">
                {t('loading.clearFilters')}
              </Button>
            }
          />
        </Box>

        <DemoNote>{t('notes.skeletonShape')}</DemoNote>
      </Stack>
    </DemoSection>
  );
}
