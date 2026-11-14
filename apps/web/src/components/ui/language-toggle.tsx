'use client';

import { Button, Menu, Portal, Text } from '@chakra-ui/react';
import { Languages } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { isLocale, LOCALE_LABELS, routing } from '@/i18n/routing';

export function LanguageToggle() {
  const t = useTranslations('language');
  const locale = useLocale();
  const current = isLocale(locale) ? LOCALE_LABELS[locale] : '';
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function handleSelect({ value }: { value: string }) {
    if (!isLocale(value) || value === locale) return;

    startTransition(() => {
      const { search, hash } = window.location;
      router.replace(pathname + search + hash, { locale: value });
    });
  }

  return (
    <Menu.Root positioning={{ placement: 'bottom-end' }}>
      <Menu.Trigger asChild>
        <Button
          variant="ghost"
          aria-label={current ? `${t('label')}: ${current}` : t('label')}
          title={t('label')}
          disabled={isPending}
          px={{ base: '2', md: '3' }}
        >
          <Languages />
          <Text as="span" hideBelow="md">
            {current}
          </Text>
        </Button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content>
            <Menu.RadioItemGroup value={locale} onValueChange={handleSelect}>
              {routing.locales.map((option) => (
                <Menu.RadioItem key={option} value={option} lang={option}>
                  <Menu.ItemIndicator />
                  {LOCALE_LABELS[option]}
                </Menu.RadioItem>
              ))}
            </Menu.RadioItemGroup>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
