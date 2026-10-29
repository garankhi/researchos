import { Box, Button, Container, Stack, Typography } from '@mui/material';
import { SearchOff } from '@mui/icons-material';
import { getTranslations } from 'next-intl/server';
import NextLink from '@/components/ui/link';

/**
 * 404 UI for missing resources.
 *
 * Rendered when `notFound()` is called in the render path, and for URLs that
 * match no route. Next.js adds a `<meta name="robots" content="noindex" />`
 * tag when the 404 is streamed.
 */
export default async function NotFound() {
  const t = await getTranslations('notFound');
  const tCommon = await getTranslations('common');

  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center' }}>
        <SearchOff color="disabled" sx={{ fontSize: 48 }} />
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
