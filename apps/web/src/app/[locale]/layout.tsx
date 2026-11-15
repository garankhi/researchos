import { Suspense } from 'react';
import type { Metadata } from 'next';
import { EmotionRegistry } from '@/components/providers/emotion-registry';
import { AppThemeProvider } from '@/components/providers/theme-provider';
import { QueryProvider } from '@/components/providers/query-provider';
import { SnackbarProvider } from '@/components/providers/snackbar-provider';
import { DisplaySettings } from '@/components/ui/display-settings';
import { AccountSlot } from '@/features/identity';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { fontVariableClasses } from '@/theme/fonts';
import { AppHeader } from './_components/app-header';

export const metadata: Metadata = {
  title: 'ResearchOS',
  description: 'Research networking and discovery platform',
  icons: {
    icon: { url: '/researchos-mark.svg', type: 'image/svg+xml', sizes: 'any' },
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /*
   * The locale and the messages are read here, once, and handed to
   * `NextIntlClientProvider`. Every Client Component below the provider can
   * then call `useTranslations()` without a server round trip.
   *
   * `getMessages()` returns the catalog for the active locale only — the
   * other locale's catalog never reaches the browser.
   */
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={fontVariableClasses.join(' ')}
      // next-themes writes the color scheme class onto <html> before React
      // hydrates; without this the mismatch is reported as a hydration warning.
      suppressHydrationWarning
    >
      <body>
        <EmotionRegistry>
          <AppThemeProvider>
            <QueryProvider>
              <NextIntlClientProvider
                locale={locale}
                messages={messages}
                // Formats dates and numbers in the active locale.
                formats={{
                  dateTime: {
                    short: { dateStyle: 'short' },
                    long: { dateStyle: 'long' },
                  },
                  number: {
                    precise: { maximumFractionDigits: 4 },
                  },
                }}
              >
                <SnackbarProvider>
                  {/* Both controls read the current path. Separate boundaries
                      let Next.js prerender the rest of the layout. */}
                  <Suspense fallback={null}>
                    <AppHeader accountSlot={<AccountSlot />} />
                  </Suspense>
                  {children}
                  <Suspense fallback={null}>
                    <DisplaySettings />
                  </Suspense>
                </SnackbarProvider>
              </NextIntlClientProvider>
            </QueryProvider>
          </AppThemeProvider>
        </EmotionRegistry>
      </body>
    </html>
  );
}

/**
 * Every locale is prerendered as its own route.
 *
 * Without this, the build fails under `cacheComponents: true` — the
 * `[locale]` segment is a root parameter, and a root parameter needs at
 * least one value or the build cannot resolve the route.
 */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}
