import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { EmotionRegistry } from '@/components/providers/emotion-registry';
import { AppThemeProvider } from '@/components/providers/theme-provider';
import { QueryProvider } from '@/components/providers/query-provider';
import { SnackbarProvider } from '@/components/providers/snackbar-provider';
import Header from '@/components/ui/header';
import { AccountSlot } from '@/features/identity';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { routing } from '@/i18n/routing';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'ResearchOS',
  description: 'Research networking and discovery platform',
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
      className={`${geistSans.variable} ${geistMono.variable}`}
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
                  {/* The header is a shared primitive and knows nothing
                      about a domain, so the account area is passed in as a
                      slot. The dependency runs the other way: the identity
                      feature knows about the header's slot, not the
                      reverse.

                      The header reads the current path — the account area
                      carries it into the sign-in link as `returnTo` — so it
                      is wrapped in a `<Suspense>` boundary. Next.js cannot
                      prerender a component that reads URL data, and the
                      header sits above every route, so the boundary belongs
                      here rather than in each page. */}
                  <Suspense fallback={null}>
                    <Header accountSlot={<AccountSlot />} />
                  </Suspense>
                  {children}
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
