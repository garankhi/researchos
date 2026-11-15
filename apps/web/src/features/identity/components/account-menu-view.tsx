'use client';

import { Button, Icon, Menu, Portal } from '@chakra-ui/react';
import { BadgeCheck } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import NextLink from '@/components/ui/link';
import type { CurrentUser } from '../types';

const HOVER_CLOSE_DELAY_MS = 150;

export function AccountAvatar() {
  return (
    <Image
      src="/default-avatar.webp"
      alt=""
      width={44}
      height={44}
      loading="eager"
      unoptimized
    />
  );
}

export function AccountMenuView({
  user,
  isLoggingOut,
  onLogout,
}: {
  user: Pick<CurrentUser, 'fullName'>;
  isLoggingOut: boolean;
  onLogout: () => void;
}) {
  const t = useTranslations('nav');
  const label = t('accountOfCurrentUser', { name: user.fullName });
  const [openMode, setOpenMode] = useState<'hover' | 'trigger' | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  function cancelHoverClose() {
    clearTimeout(closeTimer.current);
  }

  function scheduleHoverClose() {
    cancelHoverClose();
    closeTimer.current = setTimeout(() => {
      if (menu.current?.contains(document.activeElement)) return;
      setOpenMode((mode) => (mode === 'hover' ? null : mode));
    }, HOVER_CLOSE_DELAY_MS);
  }

  return (
    <Menu.Root
      open={openMode !== null}
      // Keyboard opening finds the first enabled item during the transition.
      lazyMount={false}
      unmountOnExit={false}
      onOpenChange={({ open }) => {
        cancelHoverClose();
        setOpenMode(open ? 'trigger' : null);
      }}
      positioning={{ placement: 'bottom-end', gutter: 10 }}
    >
      <Menu.Trigger asChild>
        <Button
          variant="ghost"
          boxSize="11"
          minW="11"
          p="0"
          aria-label={label}
          onPointerEnter={(event) => {
            cancelHoverClose();
            if (event.pointerType === 'mouse') {
              setOpenMode((mode) => mode ?? 'hover');
            }
          }}
          onPointerLeave={scheduleHoverClose}
          onClickCapture={(event) => {
            if (openMode === 'hover') {
              event.preventDefault();
              setOpenMode('trigger');
              menu.current?.focus();
            }
          }}
        >
          <AccountAvatar />
        </Button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content
            ref={menu}
            minW="min(14.5rem, 90vw)"
            p="0"
            fontFamily="sans"
            boxShadow="overlayPanel"
            onPointerEnter={cancelHoverClose}
            onPointerLeave={scheduleHoverClose}
          >
            <Menu.Item
              value="verify-affiliation"
              disabled
              px="6"
              py="4"
              textStyle="sm"
            >
              <Icon as={BadgeCheck} color="blue.solid" aria-hidden />
              {t('verifyAffiliation')}
            </Menu.Item>
            <Menu.Separator my="0" />
            <Menu.Item
              value="my-profile"
              asChild
              layerStyle="interactiveRow"
              px="6"
              py="4"
              textStyle="sm"
            >
              <NextLink href="/profile/my-profile">{t('yourProfile')}</NextLink>
            </Menu.Item>
            <Menu.Item value="saved-list" disabled px="6" py="4" textStyle="sm">
              {t('savedList')}
            </Menu.Item>
            <Menu.Separator my="0" />
            <Menu.Item value="settings" disabled px="6" py="4" textStyle="sm">
              {t('settings')}
            </Menu.Item>
            <Menu.Item
              value="help-center"
              disabled
              px="6"
              py="4"
              textStyle="sm"
            >
              {t('helpCenter')}
            </Menu.Item>
            <Menu.Separator my="0" />
            <Menu.Item
              value="logout"
              disabled={isLoggingOut}
              onSelect={onLogout}
              layerStyle="interactiveRow"
              px="6"
              py="4"
              textStyle="sm"
            >
              {t('logout')}
            </Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
