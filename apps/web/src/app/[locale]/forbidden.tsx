import { Box, Button, Container, Stack, Typography } from '@mui/material';
import { LockOutlined } from '@mui/icons-material';
import { getTranslations } from 'next-intl/server';
import NextLink from '@/components/ui/link';

/**
 * 403 UI for authenticated users who lack access.
 *
 * Rendered when `forbidden()` is called in the render path. Requires
 * `experimental.authInterrupts: true` in next.config.ts.
 *
 * Next.js returns a 403 status before streaming starts, and injects a
 * `<meta name="robots" content="noindex" />` tag.
 */
export default async function Forbidden() {
  const t = await getTranslations('forbidden');
  const tCommon = await getTranslations('common');

  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center' }}>
        <LockOutlined color="disabled" sx={{ fontSize: 48 }} />
        <Typography variant="h5" component="h1" sx={{ fontWeight: 500 }}>
          {t('title')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('description')}
        </Typography>
        <Box>
          <Button variant="contained" component={NextLink} href="/">
            {tCommon('backToHome')}
          </Button>
        </Box>
      </Stack>
    </Container>
  );
}
