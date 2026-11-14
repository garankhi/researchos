import { Suspense } from 'react';
import { Box, Container, Heading, Stack, Text } from '@chakra-ui/react';
import { getTranslations } from 'next-intl/server';
import { LoginForm } from '@/features/identity';
import { LoadingSkeleton } from '@/components/ui/feedback';

/**
 * The login screen.
 *
 * It is a Server Component that renders the client-side form: the page
 * itself needs no browser API, and the form is the only interactive part.
 *
 * The page is deliberately plain — a card with the form in it. The form
 * reports its own failures inline, next to the input that caused them.
 *
 * The form reads the `returnTo` query parameter, and reading search
 * params is a request-time value. Under `cacheComponents` that needs a
 * Suspense boundary, or the whole page would be pushed out of the static
 * shell — so the form sits behind one and the shell keeps the card.
 */
export default async function LoginPage() {
  const t = await getTranslations('identity');

  return (
    <Container as="main" maxW="sm" py="6">
      <Stack gap="4" align="center">
        <Box textAlign="center">
          <Heading as="h1" size="xl">
            {t('title')}
          </Heading>
          <Text textStyle="sm" color="fg.muted">
            {t('subtitle')}
          </Text>
        </Box>

        <Box p="4" w="full" bg="bg.panel" borderWidth="1px" borderRadius="lg">
          <Suspense
            fallback={<LoadingSkeleton variant="rectangular" height={120} />}
          >
            <LoginForm />
          </Suspense>
        </Box>
      </Stack>
    </Container>
  );
}
