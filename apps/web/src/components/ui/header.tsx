'use client';

import type { ReactNode } from 'react';
import {
  Button,
  Flex,
  HStack,
  IconButton,
  Link,
  Menu,
  Portal,
} from '@chakra-ui/react';
import { MenuIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import NextLink from './link';
import SearchBar from './search-bar';
import { LanguageToggle } from './language-toggle';
import { ThemeToggle } from './theme-toggle';

const pageKeys = ['products', 'pricing', 'blog'] as const;

export default function Header({ accountSlot }: { accountSlot?: ReactNode }) {
  const t = useTranslations('nav');
  const common = useTranslations('common');

  return (
    <Flex
      as="header"
      bg="bg.panel"
      borderBottomWidth="1px"
      px={{ base: '2', md: '4' }}
      minH="16"
      py="2"
      flexWrap={{ base: 'wrap', sm: 'nowrap' }}
      gap={{ base: '1', md: '3' }}
      align="center"
    >
      <Menu.Root positioning={{ placement: 'bottom-start' }}>
        <Menu.Trigger asChild>
          <IconButton variant="ghost" aria-label={t('openMenu')} hideFrom="md">
            <MenuIcon />
          </IconButton>
        </Menu.Trigger>
        <Portal>
          <Menu.Positioner hideFrom="md">
            <Menu.Content>
              {pageKeys.map((page) => (
                <Menu.Item key={page} value={page}>
                  {t(page)}
                </Menu.Item>
              ))}
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>
      <Link asChild fontSize="lg" fontWeight="bold" flexShrink="0">
        <NextLink href="/">{common('appName')}</NextLink>
      </Link>

      <HStack as="nav" gap="0" hideBelow="md">
        {pageKeys.map((page) => (
          <Button key={page} size="sm" variant="ghost">
            {t(page)}
          </Button>
        ))}
      </HStack>
      <Flex flex="1" minW="0" justify="center" hideBelow="md">
        <SearchBar mode="inline" />
      </Flex>

      <HStack
        gap={{ base: '0', sm: '1' }}
        ms="auto"
        w={{ base: 'full', sm: 'auto' }}
        justify="end"
      >
        <SearchBar mode="popover" />
        <LanguageToggle />
        <ThemeToggle />
        {accountSlot}
      </HStack>
    </Flex>
  );
}
