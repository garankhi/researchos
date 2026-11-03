import { Box, Container, Paper, Stack, Typography } from '@mui/material';
import { getTranslations } from 'next-intl/server';
import { LoginForm } from '@/features/identity';

/**
 * The login screen.
 *
 * It is a Server Component that renders the client-side form: the page
 * itself needs no browser API, and the form is the only interactive part.
 *
 * The page is deliberately plain — a card with the form in it. The form
 * reports its own failures inline, next to the input that caused them.
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
          <LoginForm />
        </Paper>
      </Stack>
    </Container>
  );
}
