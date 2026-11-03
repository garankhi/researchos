'use client';

import { useTranslations } from 'next-intl';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import { ErrorState, LoadingSkeleton } from '@/components/ui/feedback';
import NextLink from '@/components/ui/link';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import { useLogout } from '../hooks/use-logout';
import { useMe } from '../hooks/use-me';

/**
 * The signed-in landing state.
 *
 * It answers one question — "who am I right now?" — and it answers it from
 * the session, not from what the login form remembered. The session is the
 * only source of truth: a session that expired in another tab shows up here
 * as signed out, because `GET /me` says so.
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

  const { data, isLoaded, isFetching, isFailed, isSignedOut, refetch } =
    useMe();
  const logout = useLogout();

  if (isFetching && !isLoaded) {
    return <LoadingSkeleton variant="text" width={260} />;
  }

  if (isFailed) {
    return (
      <ErrorState
        title={tError('loadFailedTitle')}
        message={tError('loadFailedDescription')}
        onRetry={() => void refetch()}
      />
    );
  }

  if (isSignedOut || !data) {
    return (
      <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
        <Typography variant="body2" color="text.secondary">
          {t('signedOut')}
        </Typography>
        <Button variant="contained" component={NextLink} href="/login">
          {t('signInAction')}
        </Button>
      </Stack>
    );
  }

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        showSnackbar({ severity: 'success', message: t('signedOutToast') });
      },
    });
  };

  return (
    <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
      <Typography variant="h6" component="p" sx={{ fontWeight: 600 }}>
        {t('welcome', { name: data.fullName })}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {data.email}
      </Typography>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {data.roles.map((role) => (
          <Chip key={role} label={role} size="small" />
        ))}
      </Box>

      <Button
        variant="outlined"
        onClick={handleLogout}
        loading={logout.isPending}
        sx={{ mt: 1 }}
      >
        {t('signOut')}
      </Button>
    </Stack>
  );
}
