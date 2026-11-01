import { Suspense } from 'react';
import { Box, Container, Divider, Stack, Typography } from '@mui/material';
import { getTranslations } from 'next-intl/server';
import { LoadingSkeleton } from '@/components/ui/feedback';
import { AccessSection } from './_components/access-section';
import { ApiSection } from './_components/api-section';
import { CascadeSection } from './_components/cascade-section';
import { ErrorSection } from './_components/error-section';
import { FormSection } from './_components/form-section';
import { LoadingSection } from './_components/loading-section';
import { MuiSection } from './_components/mui-section';
import { SuspendDemo } from './_components/suspend-demo';
import { ThemeSection } from './_components/theme-section';

/**
 * Demo page exercising the frontend stack end to end.
 *
 * This is a development scaffold, not a product screen. Every section maps
 * to a convention that the rest of the app is expected to follow:
 *
 * 1. MUI components — theme, emotion cache, v9 prop surface.
 * 2. Tailwind x MUI cascade — utility classes must win without `!important`.
 * 3. Theme / dark mode — next-themes bridged into MUI's color scheme.
 * 4. Loading — skeletons, Suspense fallbacks, segment `loading.tsx`.
 * 5. Error — `ErrorState`, `catchError` boundary, segment `error.tsx`.
 * 6. API — Orval-generated hooks over TanStack Query against apps/api.
 * 7. Forms — zod schema, react-hook-form, MUI form components.
 * 8. Access — `notFound()`, `unauthorized()`, `forbidden()` boundaries.
 */
export default async function DemoPage() {
  const t = await getTranslations('demo');

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack spacing={1} sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
          {t('title')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('description')}
        </Typography>
      </Stack>

      <Stack spacing={3}>
        <MuiSection />
        <CascadeSection />
        <ThemeSection />
        <ApiSection />
        <FormSection />
        <LoadingSection />
        <ErrorSection />
        <AccessSection />

        <Box component="section" id="suspense">
          <Stack spacing={2}>
            <Typography variant="h6" component="h2" sx={{ fontWeight: 600 }}>
              {t('sections.suspense.title')}
            </Typography>
            <Divider sx={{ my: 1 }} />
            <Suspense
              fallback={<LoadingSkeleton variant="rectangular" height={40} />}
            >
              <SuspendDemo />
            </Suspense>
          </Stack>
        </Box>
      </Stack>
    </Container>
  );
}
