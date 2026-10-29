import { Box, Button, Container, Stack, Typography } from '@mui/material';
import { Login } from '@mui/icons-material';
import { getTranslations } from 'next-intl/server';
import NextLink from '@/components/ui/link';

/**
 * 401 UI for unauthenticated visitors.
 *
 * Rendered when `unauthorized()` is called in the render path. Requires
 * `experimental.authInterrupts: true` in next.config.ts.
 *
 * Next.js returns a 401 status before streaming starts, and injects a
 * `<meta name="robots" content="noindex" />` tag.
 *
 * Replace the `/login` href with the real SSO entry point once FPTU SSO is
 * integrated.
 */
export default async function Unauthorized() {
  const t = await getTranslations('unauthorized');

  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center' }}>
        <Login color="disabled" sx={{ fontSize: 48 }} />
        <Typography variant="h5" component="h1" sx={{ fontWeight: 500 }}>
          {t('title')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('description')}
        </Typography>
        <Box>
          <Button variant="contained" component={NextLink} href="/login">
            {t('action')}
          </Button>
        </Box>
      </Stack>
    </Container>
  );
}
