'use client';

import { useTranslations } from 'next-intl';
import { Badge, Box, Button, Stack, Text } from '@chakra-ui/react';
import { ErrorState, LoadingSkeleton } from '@/components/ui/feedback';
import NextLink from '@/components/ui/link';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import { useLogout } from '../hooks/use-logout';
import { useSession } from '../hooks/use-session';

/**
 * The signed-in landing state.
 *
 * It answers one question — "who am I right now?" — and it answers it from
 * the session, not from what the login form remembered. The session is the
 * only source of truth: a session that expired in another tab shows up
 * here as signed out, because `GET /me` says so.
 *
 * The three states are explicit, never raw query flags:
 *
 * - loading → a skeleton, sized like the content it replaces;
 * - signed out → a link to the login screen, not an error;
 * - signed in → the account's name, email and roles.
 *
 * "Not signed in" is not an error state, so it never renders an
 * `ErrorState` — the visitor simply has a way forward.
 */
export function SessionSummary() {
  const t = useTranslations('identity');
  const tError = useTranslations('errors');
  const { showSnackbar } = useSnackbar();

  const { user, isFetching, isFailed, isSignedOut } = useSession();
  const logout = useLogout();

  if (isFetching && !user) {
    return <LoadingSkeleton variant="text" width={260} />;
  }

  if (isFailed) {
    return (
      <ErrorState
        title={tError('loadFailedTitle')}
        message={tError('loadFailedDescription')}
      />
    );
  }

  if (isSignedOut || !user) {
    return (
      <Stack gap="1" align="start">
        <Text textStyle="sm" color="fg.muted">
          {t('signedOut')}
        </Text>
        <Button asChild>
          <NextLink href="/login">{t('signInAction')}</NextLink>
        </Button>
      </Stack>
    );
  }

  const handleLogout = () => {
    // `mutateAsync` rather than `mutate` with a per-call `onSuccess`: a
    // per-call callback only runs while the observer still has listeners,
    // and clearing the session store can unmount this component. See
    // the note in `useLogout`.
    logout
      .mutateAsync(undefined)
      .then(() => {
        showSnackbar({ severity: 'success', message: t('signedOutToast') });
      })
      .catch(() => {
        showSnackbar({ severity: 'error', message: t('signOutFailed') });
      });
  };

  return (
    <Stack gap="1" align="start">
      <Text textStyle="lg" fontWeight="semibold">
        {t('welcome', { name: user.fullName })}
      </Text>
      <Text textStyle="sm" color="fg.muted">
        {user.email}
      </Text>

      <Box display="flex" gap="1" flexWrap="wrap">
        {user.roles.map((role) => (
          <Badge key={role}>{role}</Badge>
        ))}
      </Box>

      <Button
        variant="outline"
        onClick={handleLogout}
        loading={logout.isPending}
        mt="1"
      >
        {t('signOut')}
      </Button>
    </Stack>
  );
}
