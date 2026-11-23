'use client';

import { Badge, Button, Flex, Heading, Icon, Stack } from '@chakra-ui/react';
import { FileText, Hash, UserRound, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import { apiErrorCode } from '@/lib/api-error';
import { resolveErrorCode } from '@/utils/error-messages';
import { useFollow } from '../hooks/use-follow';
import type { Follow, FollowableEntityType, FollowEntityType } from '../types';
import { EntityLink } from '@/features/discovery';

/**
 * The route of a followed entity.
 *
 * A researcher is a profile, a group is a group page and a topic has no
 * page of its own yet — a topic is listed under its profile's interests,
 * so a followed topic links to the profile that owns it.
 */
function targetHref(follow: Follow): string | null {
  switch (follow.entityType) {
    case 'RESEARCHER':
      return `/profile/${follow.entityId}`;
    case 'GROUP':
      return `/groups/${follow.entityId}`;
    default:
      return null;
  }
}

/** The icon that marks the kind of a followed entity. */
function targetIcon(entityType: FollowEntityType) {
  switch (entityType) {
    case 'RESEARCHER':
      return UserRound;
    case 'GROUP':
      return Hash;
    default:
      return FileText;
  }
}

/**
 * One followed entity, with the action that stops following it.
 *
 * The row reads and writes the follow state through the shared
 * `useFollow` hook, so unfollowing here is reflected on every detail view
 * at once — the button and the list share one cache.
 */
export function FollowListRow({ follow }: { follow: Follow }) {
  const t = useTranslations('follow');
  const tError = useTranslations('errors');
  const { showSnackbar } = useSnackbar();

  const entityType = follow.entityType as FollowableEntityType;
  const followState = useFollow({
    entityType,
    entityId: follow.entityId,
  });

  const href = targetHref(follow);
  const IconComponent = targetIcon(follow.entityType);

  async function handleUnfollow() {
    try {
      await followState.unfollow();
      showSnackbar({
        severity: 'success',
        message: t('unfollowedToast'),
      });
    } catch (error) {
      // The failure is rendered inline, next to the row that failed.
      showSnackbar({
        severity: 'error',
        message: resolveErrorCode(
          tError,
          apiErrorCode(error),
          t('actionFailed'),
        ),
      });
    }
  }

  return (
    <Flex gap="3" align="flex-start" minW="0">
      <Flex
        boxSize="10"
        bg="bg.muted"
        align="center"
        justify="center"
        flexShrink={0}
        mt="0.5"
      >
        <Icon as={IconComponent} boxSize="5" color="fg.muted" aria-hidden />
      </Flex>

      <Stack gap="1" minW="0" flex="1">
        {href ? (
          <Heading as="h3" size="sm" fontWeight="bold" lineHeight="1.35">
            <EntityLink
              entityType={follow.entityType}
              entityId={follow.entityId}
              href={href}
            >
              {follow.displayName}
            </EntityLink>
          </Heading>
        ) : (
          <Heading as="h3" size="sm" fontWeight="bold" lineHeight="1.35">
            {follow.displayName}
          </Heading>
        )}

        <Flex gap="2" align="center" flexWrap="wrap">
          <Badge variant="subtle" colorPalette="gray">
            {t(`entityTypes.${follow.entityType}`)}
          </Badge>
        </Flex>
      </Stack>

      <Button
        variant="ghost"
        size="xs"
        flexShrink={0}
        mt="0.5"
        loading={followState.isRemoving}
        loadingText={t('updating')}
        aria-label={t('unfollowAction', { name: follow.displayName })}
        onClick={() => void handleUnfollow()}
      >
        <X />
        {t('unfollowActionShort')}
      </Button>
    </Flex>
  );
}
