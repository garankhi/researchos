'use client';

import { Button, Flex, Text } from '@chakra-ui/react';
import { Check, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import { apiErrorCode } from '@/lib/api-error';
import { resolveErrorCode } from '@/utils/error-messages';
import { useFollow } from '../hooks/use-follow';
import type { FollowableEntityType } from '../types';

/**
 * The Follow button of a detail view.
 *
 * It sits on the profile, group and output pages, and toggles the caller's
 * follow of the entity the page is about. The state comes from the
 * caller's cached follow list, so the button reflects the truth without a
 * reload and without a request per page.
 *
 * The button renders nothing when the caller cannot follow the entity — a
 * viewer without the `RESEARCHER` role, a researcher on their own profile,
 * or an entity the API does not accept as a target.
 */
export function FollowButton({
  entityType,
  entityId,
  size = 'sm',
  variant,
  align = 'flex-end',
}: {
  entityType: FollowableEntityType;
  entityId?: string;
  size?: 'xs' | 'sm' | 'md';
  variant?: 'solid' | 'outline' | 'ghost';
  /**
   * Where the button sits next to its content. A header that puts the
   * button on the right passes `flex-end`; a stacked column passes
   * `flex-start`.
   */
  align?: 'flex-start' | 'flex-end';
}) {
  const t = useTranslations('follow');
  const tError = useTranslations('errors');
  const { showSnackbar } = useSnackbar();

  const follow = useFollow({ entityType, entityId });

  if (!entityId || !follow.canFollow) return null;

  async function handleToggle() {
    try {
      const nowFollowing = !follow.isFollowing;
      await follow.toggle();
      showSnackbar({
        severity: 'success',
        message: t(nowFollowing ? 'followedToast' : 'unfollowedToast'),
      });
    } catch (error) {
      // The failure is rendered inline below the button, where the user is
      // already looking. A snackbar auto-hides, and an error the user did
      // not read is an error they will repeat.
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
    <Flex direction="column" gap="1" align={align} flexShrink={0}>
      <Button
        variant={variant ?? (follow.isFollowing ? 'outline' : 'solid')}
        size={size}
        loading={follow.isToggling}
        loadingText={t('updating')}
        aria-pressed={follow.isFollowing}
        onClick={() => void handleToggle()}
      >
        {follow.isFollowing ? <Check /> : <UserPlus />}
        {t(follow.isFollowing ? 'following' : 'follow')}
      </Button>
      {follow.error ? (
        <Text textStyle="xs" color="fg.error" role="alert">
          {resolveErrorCode(tError, apiErrorCode(follow.error), t('actionFailed'))}
        </Text>
      ) : null}
    </Flex>
  );
}
