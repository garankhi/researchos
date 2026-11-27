'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Badge,
  Flex,
  IconButton,
  Link,
  Popover,
  Portal,
  Text,
} from '@chakra-ui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  NOTIFICATION_NAMESPACE,
  NotificationSocketEvent,
} from '@researchos/chat';
import { Bell, Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { io } from 'socket.io-client';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import NextLink from '@/components/ui/link';
import { useChatSocket } from '@/features/chat';
import { useSession } from '@/features/identity';
import { usePathname, useRouter } from '@/i18n/navigation';
import {
  chatControllerListConversations,
  notificationsControllerList,
  notificationsControllerRead,
  notificationsControllerUnread,
} from '@/lib/api';
import type { NotificationDto } from '@/lib/api/models';
import { NotificationRow, notificationTarget } from './notification-row';

export function notificationQueryKey(userId: string) {
  return ['notification-inbox', userId] as const;
}

export function NotificationBell() {
  const { user } = useSession();
  const t = useTranslations('nav');

  return user ? (
    <LiveActivity key={user.id} userId={user.id} />
  ) : (
    <ChatLink label={t('messages')} count={0} />
  );
}

function ChatLink({ label, count }: { label: string; count: number }) {
  const t = useTranslations('notifications');
  return (
    <IconButton
      asChild
      variant="ghost"
      size="sm"
      data-header-icon="compact"
      position="relative"
      title={label}
      aria-label={count ? t('chatUnread', { count }) : label}
    >
      <NextLink href="/chat">
        <Mail aria-hidden />
        <UnreadBadge count={count} />
      </NextLink>
    </IconButton>
  );
}

function UnreadBadge({ count }: { count: number }) {
  return (
    count > 0 && (
      <Badge
        position="absolute"
        top="0"
        insetEnd="0"
        aria-hidden
        colorPalette="blue"
        size="xs"
      >
        {count > 99 ? '99+' : count}
      </Badge>
    )
  );
}

function LiveActivity({ userId }: { userId: string }) {
  const t = useTranslations('notifications');
  const nav = useTranslations('nav');
  const pathname = usePathname();
  const router = useRouter();
  const { showSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const lastToastAt = useRef(0);
  const notify = useCallback(
    (message: string) => {
      const now = Date.now();
      if (now - lastToastAt.current < 5000) return;
      lastToastAt.current = now;
      showSnackbar({ message });
    },
    [showSnackbar],
  );
  const [open, setOpen] = useState(false);
  const key = notificationQueryKey(userId);
  const chatKey = ['header-chat-conversations', userId] as const;
  const chat = useQuery({
    queryKey: chatKey,
    queryFn: ({ signal }) =>
      chatControllerListConversations(undefined, undefined, signal),
  });
  const unread = useQuery({
    queryKey: [...key, 'unread'],
    queryFn: () => notificationsControllerUnread(),
  });
  const recent = useQuery({
    queryKey: [...key, 'preview'],
    queryFn: () => notificationsControllerList({ page: 1, limit: 5 }),
    enabled: open,
  });

  useChatSocket({
    handlers: {
      onReconnected: () =>
        void queryClient.invalidateQueries({ queryKey: chatKey }),
      onConversationUpdated: (conversation) => {
        const previous = queryClient
          .getQueryData<typeof chat.data>(chatKey)
          ?.find((item) => item.id === conversation.id);
        const message = conversation.lastMessage;
        if (
          message &&
          message.senderId !== userId &&
          conversation.unreadCount > (previous?.unreadCount ?? 0) &&
          message.id !== previous?.lastMessage?.id &&
          !conversation.participants.some(
            (participant) =>
              participant.userId === userId && participant.notificationMuted,
          ) &&
          pathname !== '/chat' &&
          !pathname.startsWith('/chat/')
        ) {
          notify(t('newChat'));
        }
        void queryClient.invalidateQueries({ queryKey: chatKey });
      },
    },
  });

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
    const socket = io(apiUrl.replace(/\/+$/, '') + NOTIFICATION_NAMESPACE, {
      withCredentials: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
    });
    const refresh = () =>
      void queryClient.invalidateQueries({
        queryKey: notificationQueryKey(userId),
      });
    socket.on(NotificationSocketEvent.READY, refresh);
    socket.on(NotificationSocketEvent.CREATED, () => {
      refresh();
      notify(t('newNotification'));
    });
    return () => {
      socket.disconnect();
    };
  }, [notify, queryClient, t, userId]);

  const activate = useMutation({
    mutationFn: async (item: NotificationDto) => {
      if (!item.readAt) await notificationsControllerRead(item.id);
      return notificationTarget(item.link);
    },
    onSuccess: (target) => {
      void queryClient.invalidateQueries({ queryKey: key });
      setOpen(false);
      router.push(target);
    },
  });

  const count = unread.data?.count ?? 0;
  const chatCount =
    chat.data?.reduce((total, item) => total + item.unreadCount, 0) ?? 0;
  return (
    <>
      <Popover.Root
        open={open}
        onOpenChange={({ open: next }) => setOpen(next)}
        positioning={{ placement: 'bottom-end' }}
      >
        <Popover.Trigger asChild>
          <IconButton
            size="sm"
            variant="ghost"
            data-header-icon="compact"
            position="relative"
            aria-label={t('bell', { count })}
          >
            <Bell aria-hidden />
            <UnreadBadge count={count} />
          </IconButton>
        </Popover.Trigger>
        <Portal>
          <Popover.Positioner>
            <Popover.Content boxShadow="overlayPanel" maxW="calc(100vw - 1rem)">
              <Popover.Header borderBottomWidth="1px">
                <Popover.Title>{t('title')}</Popover.Title>
              </Popover.Header>
              <Popover.Body p="0" maxH="min(24rem, 55vh)" overflowY="auto">
                {recent.isPending && (
                  <Text p="4" role="status">
                    {t('loading')}
                  </Text>
                )}
                {(recent.isError || activate.isError) && (
                  <Text p="4" role="alert">
                    {t(recent.isError ? 'loadFailed' : 'actionFailed')}
                  </Text>
                )}
                {recent.data?.items.length === 0 && (
                  <Text p="4">{t('empty')}</Text>
                )}
                {recent.data?.items.map((item) => (
                  <NotificationRow
                    key={item.id}
                    item={item}
                    disabled={activate.isPending}
                    onOpen={() => activate.mutate(item)}
                  />
                ))}
              </Popover.Body>
              <Flex borderTopWidth="1px" justify="center" p="3">
                <Link asChild color="blue.fg" onClick={() => setOpen(false)}>
                  <NextLink href="/notifications">{t('seeAll')}</NextLink>
                </Link>
              </Flex>
            </Popover.Content>
          </Popover.Positioner>
        </Portal>
      </Popover.Root>
      <ChatLink label={nav('messages')} count={chatCount} />
    </>
  );
}
