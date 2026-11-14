import type { Preview } from '@storybook/nextjs-vite';
import { NextIntlClientProvider } from 'next-intl';
import { Geist, Geist_Mono } from 'next/font/google';
import { ChakraThemeProvider } from '../src/components/providers/theme-provider';
import { LOCALE_LABELS, isLocale, routing } from '../src/i18n/routing';
import en from '../src/messages/en.json';
import vi from '../src/messages/vi.json';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});
const messages = { en, vi };

const preview: Preview = {
  globalTypes: {
    locale: {
      description: 'ResearchOS language',
      toolbar: {
        icon: 'globe',
        items: routing.locales.map((value) => ({
          value,
          title: LOCALE_LABELS[value],
        })),
        dynamicTitle: true,
      },
    },
    colorMode: {
      description: 'ResearchOS color scheme',
      toolbar: {
        icon: 'paintbrush',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    locale: routing.defaultLocale,
    colorMode: 'light',
  },
  parameters: {
    a11y: { test: 'error' },
    nextjs: { appDirectory: true },
  },
  decorators: [
    (Story, { globals }) => {
      const locale = isLocale(globals.locale)
        ? globals.locale
        : routing.defaultLocale;
      const colorMode = globals.colorMode === 'dark' ? 'dark' : 'light';
      const root = document.documentElement;

      // Portaled content inherits the iframe's locale and color mode.
      root.lang = locale;
      root.classList.remove('light', 'dark');
      root.classList.add(geistSans.variable, geistMono.variable, colorMode);
      root.style.colorScheme = colorMode;

      return (
        <ChakraThemeProvider>
          <NextIntlClientProvider locale={locale} messages={messages[locale]}>
            <Story />
          </NextIntlClientProvider>
        </ChakraThemeProvider>
      );
    },
  ],
};

export default preview;
