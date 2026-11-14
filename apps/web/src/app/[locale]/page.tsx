import { Suspense } from 'react';
import { Container, Heading, Stack } from '@chakra-ui/react';
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
    <Container as="main" maxW="3xl" py="4">
      <Stack gap="3">
        <Heading as="h1" size="xl">
          {t('title')}
        </Heading>

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
