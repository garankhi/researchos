'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { useTranslations } from 'next-intl';
import ErrorBoundary from '@/components/ui/error-boundary';
import { ErrorState } from '@/components/ui/feedback';
import { DemoNote, DemoRow, DemoSection } from './demo-ui';

/**
 * Throws once per "arm" so the component-level boundary can be tested.
 *
 * The throw happens in an effect rather than during render. React Compiler
 * memoizes components whose props do not change, so a render-phase throw
 * keyed on a stable ref would never re-run after the first render. An effect
 * keyed on `version` re-runs whenever the parent arms a new throw.
 *
 * The flag lives in the parent so it survives the unmount that the error
 * boundary performs when it swaps in its fallback. Consuming the flag inside
 * the effect means a `retry()` remount does not throw again.
 */
function Boom({
  armedRef,
  version,
  message,
  healthyMessage,
}: {
  armedRef: React.RefObject<boolean>;
  version: number;
  message: string;
  healthyMessage: string;
}) {
  useEffect(() => {
    if (armedRef.current) {
      armedRef.current = false;
      throw new Error(message);
    }
  }, [armedRef, version, message]);

  return (
    <Typography variant="body2" color="success.main">
      {healthyMessage}
    </Typography>
  );
}

export function ErrorSection() {
  const t = useTranslations('demo');
  const armedRef = useRef(false);
  const [version, setVersion] = useState(0);

  const arm = () => {
    armedRef.current = true;
    setVersion((v) => v + 1);
  };

  return (
    <DemoSection
      id="error"
      title={t('sections.error.title')}
      description={t('sections.error.description')}
    >
      <Stack spacing={3}>
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {t('errorSection.sharedState')}
          </Typography>
          <ErrorState
            title={t('errorSection.sharedState')}
            message={t('notes.errorBoundary')}
            onRetry={() => undefined}
          />
        </Box>

        <Box>
          <DemoRow label={t('labels.componentBoundary')}>
            <Button
              size="small"
              variant="contained"
              color="error"
              onClick={arm}
            >
              {t('actions.throwError')}
            </Button>
          </DemoRow>

          <Box sx={{ mt: 1.5 }}>
            <ErrorBoundary title={t('errorSection.sharedState')}>
              <Boom
                armedRef={armedRef}
                version={version}
                message={t('errorSection.intentional')}
                healthyMessage={t('errorSection.healthy')}
              />
            </ErrorBoundary>
          </Box>
          <DemoNote>{t('notes.errorBoundary')}</DemoNote>
        </Box>

        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {t('errorSection.routeLevel')}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            color="error"
            component="a"
            href="/demo/crash"
          >
            {t('actions.openRouteError')}
          </Button>
        </Box>
      </Stack>
    </DemoSection>
  );
}
