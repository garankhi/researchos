'use client';

import { useEffect } from 'react';
import { Badge, Box, IconButton } from '@chakra-ui/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  NOTIFICATION_NAMESPACE,
  NotificationSocketEvent,
} from '@researchos/chat';
import { Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { io } from 'socket.io-client';
import NextLink from '@/components/ui/link';
import { useSession } from '@/features/identity';
import { notificationsControllerUnread } from '@/lib/api';

export function notificationQueryKey(userId: string) {
  return ['notification-inbox', userId] as const;
}

export function NotificationBell() {
  const t = useTranslations('notifications');
  const { user } = useSession();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const unread = useQuery({
    queryKey: [...notificationQueryKey(userId ?? ''), 'unread'],
    queryFn: () => notificationsControllerUnread(),
    enabled: Boolean(userId),
  });

  useEffect(() => {
    if (!userId) return;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
    const socket = io(apiUrl.replace(/\/+$/, '') + NOTIFICATION_NAMESPACE, {
      withCredentials: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
    });
    const refresh = () => {
      void queryClient.invalidateQueries({
        queryKey: notificationQueryKey(userId),
      });
    };
    socket.on(NotificationSocketEvent.READY, refresh);
    socket.on(NotificationSocketEvent.CREATED, refresh);
    return () => {
      socket.disconnect();
    };
  }, [queryClient, userId]);

  if (!userId) return null;
  const count = unread.data?.count ?? 0;
  return (
    <IconButton
      asChild
      size="sm"
      variant="ghost"
      position="relative"
      aria-label={t('bell', { count })}
    >
      <NextLink href="/notifications">
        <Bell aria-hidden />
        {count > 0 && (
          <Box position="absolute" top="0" insetEnd="0" aria-hidden>
            <Badge colorPalette="blue" size="xs">
              {count > 99 ? '99+' : count}
            </Badge>
          </Box>
        )}
      </NextLink>
    </IconButton>
  );
}
