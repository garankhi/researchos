'use client';

import { useState } from 'react';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  useDemoControllerGetFail,
  useDemoControllerGetSlow,
  useDemoControllerGetUnstable,
  useHealthControllerCheck,
} from '@/lib/api';
import {
  EmptyState,
  ErrorState,
  ListItemSkeleton,
  LoadingSkeleton,
} from '@/components/ui/feedback';
import { apiErrorCode } from '@/lib/api-error';
import { resolveErrorCode } from '@/utils/error-messages';
import { DemoNote, DemoRow, DemoSection } from './demo-ui';

/**
 * Exercises the generated API client end to end.
 *
 * The hooks here come from Orval, which generates them from
 * `apps/api/openapi.json`. If that chain breaks (spec not regenerated, client
 * not regenerated, wrong base URL), these panels stop working.
 *
 * Note on state flags: for the manually triggered queries `enabled` is
 * `false`, so `isPending` is `true` forever — a query that has never run has
 * status "pending". Use `isFetching` to mean "a request is in flight" and
 * `isSuccess` / `isError` to mean "a request already completed".
 */
export function ApiSection() {
  const t = useTranslations('demo');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const queryClient = useQueryClient();
  const [slowDelay, setSlowDelay] = useState(3000);

  const health = useHealthControllerCheck();
  const slow = useDemoControllerGetSlow(
    { delay: String(slowDelay) },
    { query: { enabled: false } },
  );
  const failing = useDemoControllerGetFail({
    query: { enabled: false, retry: false },
  });
  const unstable = useDemoControllerGetUnstable({
    query: { enabled: false, retry: false },
  });

  return (
    <DemoSection
      id="api"
      title={t('sections.api.title')}
      description={t('sections.api.description')}
    >
      <Stack spacing={3}>
        <Box>
          <DemoRow label="GET /health">
            <Button
              size="small"
              variant="contained"
              disabled={health.isFetching}
              onClick={() => void health.refetch()}
            >
              {health.isFetching
                ? tCommon('loading')
                : t('actions.callAgain')}
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => void queryClient.invalidateQueries()}
            >
              {t('actions.invalidateAll')}
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => queryClient.removeQueries()}
            >
              {t('actions.clearCache')}
            </Button>
          </DemoRow>

          <Box sx={{ mt: 1.5 }}>
            {health.isPending ? (
              <LoadingSkeleton variant="text" width={200} />
            ) : health.isError ? (
              <ErrorState
                title={tErrors('apiUnreachableTitle')}
                message={tErrors('apiUnreachableDescription')}
                onRetry={() => void health.refetch()}
              />
            ) : (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Chip
                  label={t('states.success')}
                  color="success"
                  size="small"
                />
                <Typography variant="body2">
                  {health.data?.status} — {health.data?.service}
                </Typography>
              </Stack>
            )}
          </Box>
        </Box>

        <Box>
          <DemoRow label="GET /demo/slow">
            <Button
              size="small"
              variant="contained"
              disabled={slow.isFetching}
              onClick={() => void slow.refetch()}
            >
              {slow.isFetching
                ? tCommon('loading')
                : t('actions.loadAfter', { ms: slowDelay })}
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setSlowDelay((d) => (d === 3000 ? 8000 : 3000))}
            >
              {t('actions.changeDelay')}
            </Button>
          </DemoRow>

          <Box sx={{ mt: 1.5 }}>
            {slow.isFetching ? (
              <ListItemSkeleton />
            ) : slow.isError ? (
              <ErrorState
                title={tErrors('requestFailedTitle')}
                message={resolveErrorCode(tErrors, apiErrorCode(slow.error), tErrors('unknown'))}
                onRetry={() => void slow.refetch()}
              />
            ) : slow.isSuccess ? (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Chip
                  label={t('states.success')}
                  color="success"
                  size="small"
                />
                <Typography variant="body2">{slow.data}</Typography>
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {t('states.notCalled')}
              </Typography>
            )}
          </Box>
          <DemoNote>{t('notes.cancelOnNavigate')}</DemoNote>
        </Box>

        <Box>
          <DemoRow label="GET /demo/fail">
            <Button
              size="small"
              color="error"
              variant="contained"
              disabled={failing.isFetching}
              onClick={() => void failing.refetch()}
            >
              {failing.isFetching
                ? tCommon('loading')
                : t('actions.callFailing')}
            </Button>
          </DemoRow>

          <Box sx={{ mt: 1.5 }}>
            {failing.isFetching ? (
              <LoadingSkeleton variant="text" width={200} />
            ) : failing.isError ? (
              <ErrorState
                title={t('states.expectedFailure')}
                message={resolveErrorCode(tErrors, apiErrorCode(failing.error), tErrors('unknown'))}
                onRetry={() => void failing.refetch()}
              />
            ) : failing.isSuccess ? (
              <EmptyState
                title={t('states.noError')}
                message={t('states.randomFailure')}
              />
            ) : (
              <Typography variant="body2" color="text.secondary">
                {t('states.notCalled')}
              </Typography>
            )}
          </Box>
          <DemoNote>{t('notes.noRetry')}</DemoNote>
        </Box>

        <Box>
          <DemoRow label="GET /demo/unstable">
            <Button
              size="small"
              variant="outlined"
              disabled={unstable.isFetching}
              onClick={() => void unstable.refetch()}
            >
              {unstable.isFetching
                ? tCommon('loading')
                : t('actions.callRandom')}
            </Button>
          </DemoRow>

          <Box sx={{ mt: 1.5 }}>
            {unstable.isFetching ? (
              <LoadingSkeleton variant="text" width={200} />
            ) : unstable.isError ? (
              <ErrorState
                title={t('states.randomFailure')}
                message={resolveErrorCode(tErrors, apiErrorCode(unstable.error), tErrors('unknown'))}
                onRetry={() => void unstable.refetch()}
              />
            ) : unstable.isSuccess ? (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Chip
                  label={t('states.success')}
                  color="success"
                  size="small"
                />
                <Typography variant="body2">{unstable.data}</Typography>
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {t('states.notCalled')}
              </Typography>
            )}
          </Box>
        </Box>
      </Stack>
    </DemoSection>
  );
}
