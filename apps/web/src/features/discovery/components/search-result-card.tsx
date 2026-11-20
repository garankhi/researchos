'use client';

import {
  Box,
  Button,
  Flex,
  Heading,
  Link,
  Stack,
  Text,
} from '@chakra-ui/react';
import Image from 'next/image';
import { useFormatter, useTranslations } from 'next-intl';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import { FieldError } from '@/components/ui/feedback';
import NextLink from '@/components/ui/link';
import type { FollowTargetDto, SearchResultItemDto } from '@/lib/api/models';
import { followKey } from '@/features/follow';
import { useChangeSearchFollow } from '../hooks/use-search-follows';

function FollowButton({
  item,
  target,
  userId,
  followed,
  ready,
}: {
  item: SearchResultItemDto;
  target: FollowTargetDto;
  userId: string;
  followed: boolean;
  ready: boolean;
}) {
  const t = useTranslations('search');
  const { showSnackbar } = useSnackbar();
  const { changeFollow, isSaving, isFailed } = useChangeSearchFollow(userId);

  async function toggleFollow() {
    try {
      await changeFollow({ target, follow: !followed });
      showSnackbar({
        severity: 'success',
        message: t(followed ? 'unfollowed' : 'followed', { title: item.title }),
      });
    } catch {
      // The mutation state keeps a localized error beside the action.
    }
  }

  return (
    <Stack gap="1" align="start">
      <Button
        size="sm"
        variant="plain"
        colorPalette="blue"
        color="blue.fg"
        px="0"
        disabled={!ready}
        loading={isSaving}
        aria-pressed={followed}
        onClick={() => void toggleFollow()}
      >
        {t(followed ? 'unfollow' : 'follow')}
      </Button>
      {isFailed && <FieldError>{t('followError')}</FieldError>}
    </Stack>
  );
}

export function SearchResultCard({
  item,
  userId,
  canFollow,
  follows,
  followsReady,
}: {
  item: SearchResultItemDto;
  userId: string;
  canFollow: boolean;
  follows: ReadonlySet<string>;
  followsReady: boolean;
}) {
  const format = useFormatter();
  const { entityType, entityId } = item;
  const isResearcher = entityType === 'RESEARCHER';
  const target: FollowTargetDto | undefined =
    canFollow &&
    (entityType === 'GROUP' || (isResearcher && entityId !== userId))
      ? { entityType, entityId }
      : undefined;

  return (
    <Stack as="article" bg="bg.panel" gap="3" p={{ base: '4', lg: '5' }}>
      <Flex justify="space-between" align="start" gap={{ base: '3', lg: '5' }}>
        <Stack gap="2" minW="0" flex="1">
          <Heading
            as="h3"
            size={{ base: 'sm', lg: 'md' }}
            overflowWrap="anywhere"
          >
            {isResearcher ? (
              <Link asChild color="fg">
                <NextLink href={`/profile/${item.entityId}`}>
                  {item.title}
                </NextLink>
              </Link>
            ) : (
              item.title
            )}
          </Heading>
          {typeof item.authorsText === 'string' &&
            item.authorsText &&
            item.authorsText !== item.title && (
              <Text textStyle="sm" color="fg.muted" overflowWrap="anywhere">
                {item.authorsText}
              </Text>
            )}
          {typeof item.body === 'string' && item.body && (
            <Text
              whiteSpace="pre-line"
              overflowWrap="anywhere"
              lineClamp="3"
              textStyle="sm"
            >
              {item.body}
            </Text>
          )}
          <Text asChild textStyle="sm" color="fg.muted">
            <time dateTime={item.updatedAt}>
              {format.dateTime(new Date(item.updatedAt), {
                dateStyle: 'medium',
                timeZone: 'UTC',
              })}
            </time>
          </Text>
        </Stack>
        {isResearcher && (
          <Box flexShrink="0" boxSize={{ base: '12', lg: '16' }}>
            <Image
              src="/default-avatar.webp"
              alt=""
              width={64}
              height={64}
              unoptimized
            />
          </Box>
        )}
      </Flex>
      {target && (
        <FollowButton
          item={item}
          target={target}
          userId={userId}
          ready={followsReady}
          followed={follows.has(followKey(target))}
        />
      )}
    </Stack>
  );
}
