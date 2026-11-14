'use client';

import {
  Box,
  Button,
  ClientOnly,
  Icon,
  IconButton,
  Popover,
  Portal,
  Stack,
  Text,
} from '@chakra-ui/react';
import { Check, Moon, Settings2, Sun } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { type Locale, LOCALE_LABELS, routing } from '@/i18n/routing';
import { LanguageFlag } from './language-flag';

const colorModes = [
  { value: 'light', label: 'lightMode', icon: Sun },
  { value: 'dark', label: 'darkMode', icon: Moon },
] as const;

const HOVER_CLOSE_DELAY_MS = 150;

function ColorModeOptions({ onSelect }: { onSelect: () => void }) {
  const t = useTranslations('theme');
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Stack gap="1" role="group" aria-label={t('label')}>
      {colorModes.map(({ value, label, icon: ModeIcon }) => {
        const selected = resolvedTheme === value;

        return (
          <Button
            key={value}
            variant="ghost"
            size="sm"
            justifyContent="start"
            aria-pressed={selected}
            onClick={() => {
              setTheme(value);
              onSelect();
            }}
          >
            <ModeIcon aria-hidden />
            {t(label)}
            {selected && <Icon as={Check} ms="auto" aria-hidden />}
          </Button>
        );
      })}
    </Stack>
  );
}

function LanguageOptions({ onSelect }: { onSelect: () => void }) {
  const t = useTranslations('language');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function selectLocale(option: Locale) {
    onSelect();
    if (option === locale) return;
    startTransition(() => {
      const { search, hash } = window.location;
      router.replace(pathname + search + hash, { locale: option });
    });
  }

  return (
    <Stack
      gap="1"
      role="group"
      aria-label={t('label')}
      borderTopWidth="1px"
      mt="2"
      pt="2"
    >
      <Text px="3.5" fontSize="xs" color="fg.muted">
        {t('label')}
      </Text>
      {routing.locales.map((option) => {
        const selected = option === locale;

        return (
          <Button
            key={option}
            variant="ghost"
            size="sm"
            justifyContent="start"
            lang={option}
            aria-pressed={selected}
            disabled={isPending}
            onClick={() => selectLocale(option)}
          >
            <Box
              as="span"
              display="inline-flex"
              flexShrink="0"
              css={{ '& > svg': { width: '20px', height: '14px' } }}
              overflow="hidden"
            >
              <LanguageFlag locale={option} />
            </Box>
            {LOCALE_LABELS[option]}
            {selected && <Icon as={Check} ms="auto" aria-hidden />}
          </Button>
        );
      })}
    </Stack>
  );
}

export function DisplaySettings() {
  const t = useTranslations('nav');
  const label = t('openSettings');
  const [openMode, setOpenMode] = useState<'hover' | 'trigger' | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const content = useRef<HTMLDivElement>(null);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  function cancelHoverClose() {
    clearTimeout(closeTimer.current);
  }

  function scheduleHoverClose() {
    cancelHoverClose();
    closeTimer.current = setTimeout(() => {
      if (content.current?.contains(document.activeElement)) return;
      setOpenMode((mode) => (mode === 'hover' ? null : mode));
    }, HOVER_CLOSE_DELAY_MS);
  }

  function closeSettings() {
    cancelHoverClose();
    setOpenMode(null);
  }

  return (
    <Popover.Root
      autoFocus={openMode === 'trigger'}
      open={openMode !== null}
      onOpenChange={({ open }) => {
        if (open) {
          cancelHoverClose();
          setOpenMode('trigger');
        } else {
          closeSettings();
        }
      }}
      positioning={{ placement: 'top-start', gutter: 6 }}
    >
      <Popover.Trigger asChild>
        <IconButton
          variant="ghost"
          size="xs"
          position="fixed"
          left="max(12px, env(safe-area-inset-left))"
          bottom="max(12px, env(safe-area-inset-bottom))"
          zIndex="sticky"
          bg="bg.panel"
          borderColor="border"
          color="fg.muted"
          aria-label={label}
          onPointerEnter={(event) => {
            cancelHoverClose();
            if (event.pointerType === 'mouse')
              setOpenMode((mode) => mode ?? 'hover');
          }}
          onPointerLeave={scheduleHoverClose}
        >
          <Settings2 aria-hidden />
        </IconButton>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content
            ref={content}
            aria-label={label}
            w="13rem"
            onPointerEnter={cancelHoverClose}
            onPointerLeave={scheduleHoverClose}
          >
            <Popover.Body p="2">
              {/* The saved theme is available only after hydration. */}
              <ClientOnly>
                <ColorModeOptions onSelect={closeSettings} />
              </ClientOnly>
              <LanguageOptions onSelect={closeSettings} />
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
