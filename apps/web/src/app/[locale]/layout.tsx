import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter';
import { AppThemeProvider } from '@/components/providers/theme-provider';
import { QueryProvider } from '@/components/providers/query-provider';
import '../globals.css';
import Header from '@/components/ui/header';
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // next-themes writes the color scheme class onto <html> before React
      // hydrates; without this the mismatch is reported as a hydration warning.
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/* `enableCssLayer` puts MUI styles in the `mui` cascade layer so
            Tailwind utilities win without !important. The matching layer
            order is declared in globals.css. */}
        <AppRouterCacheProvider options={{ enableCssLayer: true }}>
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
                <Header />
                {children}
              </NextIntlClientProvider>
            </QueryProvider>
          </AppThemeProvider>
        </AppRouterCacheProvider>
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
