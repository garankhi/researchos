import { Suspense } from 'react';
import { Box, Container, Stack, Typography } from '@mui/material';
import { getTranslations } from 'next-intl/server';
import { SessionSummary } from '@/features/identity';
import { ApiStatus } from './_components/api-status';

/**
 * The home screen.
 *
 * It shows the API status and the session state. The session state is a
 * client component, because the answer comes from the session cookie and
 * only the browser holds it.
 */
export default async function Home() {
  const t = await getTranslations('home');

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
            {t('title')}
          </Typography>
        </Box>

        <Suspense fallback={<p>{t('loadingStatus')}</p>}>
          <SessionSummary />
        </Suspense>

        <Suspense fallback={<p>{t('loadingStatus')}</p>}>
          <ApiStatus />
        </Suspense>
      </Stack>
    </Container>
  );
}
