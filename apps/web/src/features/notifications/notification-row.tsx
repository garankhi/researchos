'use client';

import { Box, Text } from '@chakra-ui/react';
import { useFormatter, useTranslations } from 'next-intl';
import type { NotificationDto } from '@/lib/api/models';

export function notificationTarget(link: string) {
  return link.startsWith('/') && !link.startsWith('//') && !link.includes('\\')
    ? link
    : '/notifications';
}

export function NotificationRow({
  item,
  disabled,
  onOpen,
}: {
  item: NotificationDto;
  disabled: boolean;
  onOpen: () => void;
}) {
  const format = useFormatter();
  const t = useTranslations('notifications');

  return (
    <Box
      asChild
      flex="1"
      minW="0"
      w="full"
      textAlign="start"
      px="4"
      py="3"
      bg={item.readAt ? undefined : 'blue.subtle'}
      layerStyle="interactiveRow"
    >
      <button type="button" disabled={disabled} onClick={onOpen}>
        <Text fontWeight={item.readAt ? 'medium' : 'bold'}>{item.title}</Text>
        <Text textStyle="sm" color="fg.muted">
          {item.body}
        </Text>
        <Text textStyle="xs" color="fg.muted">
          {!item.readAt && (
            <Text as="span" color="blue.fg" fontWeight="bold" me="2">
              {t('unread')}
            </Text>
          )}
          {format.dateTime(new Date(item.createdAt), {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
        </Text>
      </button>
    </Box>
  );
}
