'use client';

import { Avatar, Button, Menu, Portal, Text } from '@chakra-ui/react';
import { LogOut, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CurrentUser } from '../types';
import { initialsOf } from '../utils/initials';

export function AccountMenuView({
  user,
  isLoggingOut,
  onLogout,
}: {
  user: Pick<CurrentUser, 'email' | 'fullName'>;
  isLoggingOut: boolean;
  onLogout: () => void;
}) {
  const t = useTranslations('nav');
  const initials = initialsOf(user.fullName);
  const label = t('accountOfCurrentUser', { name: user.fullName });

  return (
    <Menu.Root positioning={{ placement: 'bottom-end' }}>
      <Menu.Trigger asChild>
        <Button
          variant="ghost"
          aria-label={[initials, label].filter(Boolean).join(' ')}
          title={label}
          px="1"
          minW="10"
        >
          <Avatar.Root size="sm" colorPalette="blue" hideFrom="lg" aria-hidden>
            <Avatar.Fallback aria-hidden="true">
              {initials || <UserRound />}
            </Avatar.Fallback>
          </Avatar.Root>
          <Text as="span" truncate maxW="40" hideBelow="lg">
            {user.fullName}
          </Text>
        </Button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content>
            <Menu.ItemGroup>
              <Menu.ItemGroupLabel maxW="64">
                <Text fontWeight="semibold" truncate>
                  {user.fullName}
                </Text>
                <Text color="fg.muted" truncate>
                  {user.email}
                </Text>
              </Menu.ItemGroupLabel>
              <Menu.Separator />
              <Menu.Item
                value="logout"
                disabled={isLoggingOut}
                onSelect={onLogout}
              >
                <LogOut />
                {t('logout')}
              </Menu.Item>
            </Menu.ItemGroup>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
