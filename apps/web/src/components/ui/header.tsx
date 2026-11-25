'use client';

import type { ReactNode, RefObject } from 'react';
import {
  Button,
  Flex,
  HStack,
  IconButton,
  Link,
  Menu,
  Portal,
} from '@chakra-ui/react';
import { ChevronDown, ListChecks } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/navigation';
import { NotificationBell } from '@/features/notifications';
import { BrandLink } from './brand-link';
import NextLink from './link';

const morePages = ['opportunities', 'groups'] as const;

type MoreMenuProps = {
  moreAction: {
    label: string;
    onSelect: () => void;
  };
  moreTriggerRef: RefObject<HTMLButtonElement | null>;
};

function PrimaryNavigation({ moreAction, moreTriggerRef }: MoreMenuProps) {
  const t = useTranslations('nav');
  const pathname = usePathname();

  return (
    <HStack
      as="nav"
      aria-label={t('primary')}
      gridArea="navigation"
      gap={{ base: '2', sm: '4', lg: '5' }}
      ps={{ base: '2', sm: '4', lg: '0' }}
      css={{
        '& > :is(a, button)': {
          height: { base: '52px', lg: '66px' },
          fontSize: '14px',
          position: 'relative',
        },
        '& > a, & > button[aria-disabled]': {
          _after: {
            content: '""',
            position: 'absolute',
            insetInline: '0',
            bottom: '-1px',
            height: '2px',
            bg: { base: 'transparent', lg: 'border.emphasized' },
            pointerEvents: 'none',
          },
          _currentPage: {
            _after: { height: { base: '2px', lg: '1.5px' }, bg: 'blue.solid' },
          },
        },
      }}
    >
      <Link
        asChild
        fontWeight="normal"
        color="fg"
        whiteSpace="nowrap"
        _hover={{ textDecoration: 'none', color: 'fg.muted' }}
      >
        <NextLink href="/" aria-current={pathname === '/' ? 'page' : undefined}>
          {t('home')}
        </NextLink>
      </Link>
      {morePages.map((page) => (
        <Button
          key={page}
          type="button"
          variant="plain"
          size="sm"
          px="0"
          borderWidth="0"
          color="fg"
          aria-disabled="true"
          hideBelow="lg"
        >
          {t(page)}
        </Button>
      ))}
      <Menu.Root positioning={{ placement: 'bottom-start' }}>
        <Menu.Trigger asChild>
          <Button
            ref={moreTriggerRef}
            type="button"
            variant="ghost"
            px="0"
            minW="0"
            gap="1"
            fontWeight="normal"
            hideFrom="lg"
          >
            {t('more')}
            <ChevronDown aria-hidden />
          </Button>
        </Menu.Trigger>
        <Portal>
          <Menu.Positioner hideFrom="lg">
            <Menu.Content aria-label={t('more')} boxShadow="overlayPanel">
              {morePages.map((page) => (
                <Menu.Item key={page} value={page} disabled>
                  {t(page)}
                </Menu.Item>
              ))}
              <Menu.Item
                value="header-action"
                layerStyle="interactiveRow"
                onSelect={moreAction.onSelect}
              >
                {moreAction.label}
              </Menu.Item>
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>
    </HStack>
  );
}

function HeaderActions({
  mobileSearch,
  children,
}: {
  mobileSearch: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations('nav');

  return (
    <Flex
      gap={{ base: '0', xl: '1' }}
      gridArea="actions"
      ms="auto"
      pe={{ base: '2', sm: '4', lg: '0' }}
      align="center"
      justify="end"
    >
      {mobileSearch}
      <NotificationBell />
      <IconButton
        variant="ghost"
        size="sm"
        data-header-icon="compact"
        aria-label={t('requests')}
        title={t('requests')}
        aria-disabled="true"
      >
        <ListChecks aria-hidden />
      </IconButton>
      {children}
    </Flex>
  );
}

export default function Header({
  desktopSearch,
  mobileSearch,
  moreAction,
  moreTriggerRef,
  children,
}: {
  desktopSearch: ReactNode;
  mobileSearch: ReactNode;
  children: ReactNode;
} & MoreMenuProps) {
  return (
    <Flex
      as="header"
      bg="bg.panel"
      color="fg"
      borderBottomWidth="1px"
      borderColor="border.emphasized"
      px={{ lg: '5', xl: '10' }}
      minH="66px"
      display="grid"
      gridTemplateAreas={{
        base: '"brand brand" "navigation actions"',
        lg: '"primary search actions"',
      }}
      gridTemplateColumns={{
        base: 'max-content minmax(0, 1fr)',
        lg: 'minmax(max-content, 1fr) clamp(10rem, calc(100% - 60rem), 24rem) minmax(max-content, 1fr)',
      }}
      columnGap={{ base: '1', lg: '3', xl: '6' }}
      align="center"
      css={{
        '& [data-header-icon]': {
          boxSize: { base: '34px', sm: '42px' },
          minW: '0',
          _icon: { boxSize: { base: '22px', sm: '25px' } },
          '@media (hover: hover)': {
            '&:hover': { bg: 'bg.muted' },
          },
        },
        '& [data-header-icon="compact"]': {
          boxSize: { base: '30px', sm: '38px' },
          _icon: { boxSize: '21px' },
        },
      }}
    >
      <Flex
        gridArea="primary"
        display={{ base: 'contents', lg: 'flex' }}
        align="center"
        gap={{ lg: '4', xl: '12' }}
      >
        <Flex
          gridArea="brand"
          h={{ base: '56px', lg: 'auto' }}
          justify={{ base: 'center', lg: 'start' }}
          align="center"
          borderBottomWidth={{ base: '1px', lg: '0' }}
          borderColor="border.emphasized"
        >
          <BrandLink />
        </Flex>
        <PrimaryNavigation
          moreAction={moreAction}
          moreTriggerRef={moreTriggerRef}
        />
      </Flex>
      <Flex gridArea="search" minW="0" hideBelow="lg">
        {desktopSearch}
      </Flex>
      <HeaderActions mobileSearch={mobileSearch}>{children}</HeaderActions>
    </Flex>
  );
}
