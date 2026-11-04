import { Suspense } from 'react';
import { Box, Container, Paper, Stack, Typography } from '@mui/material';
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
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Stack spacing={3} sx={{ alignItems: 'center' }}>
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
            {t('title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('subtitle')}
          </Typography>
        </Box>

        <Paper sx={{ p: 4, width: '100%' }}>
          <Suspense
            fallback={<LoadingSkeleton variant="rectangular" height={120} />}
          >
            <LoginForm />
          </Suspense>
        </Paper>
      </Stack>
    </Container>
  );
}
