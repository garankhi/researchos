'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import { useSession } from '../hooks/use-session';
import { useLogout } from '../hooks/use-logout';
import { AccountMenuView } from './account-menu-view';

/**
 * The account menu in the header.
 *
 * The avatar opens the profile and sign-out actions. The signed-in name
 * labels the trigger for assistive technology.
 *
 * ## Why the menu lives in the feature
 *
 * The header is a shared primitive and knows nothing about a domain. The
 * session is the identity domain, so the account menu lives here, in the
 * feature, and the header renders it through a slot.
 */
export function AccountMenu() {
  const tIdentity = useTranslations('identity');
  const { showSnackbar } = useSnackbar();
  const router = useRouter();

  const { user } = useSession();
  const logout = useLogout();

  const handleLogout = () => {
    // `mutateAsync` is used instead of `mutate` on purpose.
    //
    // A per-call `onSuccess` passed to `mutate()` is only run when the
    // mutation observer still has listeners. Clearing the session store
    // unmounts this component, which unsubscribes the observer — so the
    // callback would never fire and the redirect would never happen.
    //
    // Awaiting the mutation instead keeps the navigation tied to the
    // request, not to the lifetime of the component.
    logout
      .mutateAsync(undefined)
      .then(() => {
        showSnackbar({
          severity: 'success',
          message: tIdentity('signedOutToast'),
        });

        // The account is gone, so the pages that need one are not worth
        // keeping open. The home page is the safe landing spot.
        router.replace('/');
      })
      .catch(() => {
        // The session could not be revoked. The client state is cleared
        // anyway — the `onSettled` of the hook does that — because a
        // half-signed-out state is worse than a signed-out one.
        showSnackbar({
          severity: 'error',
          message: tIdentity('signOutFailed'),
        });
      });
  };

  if (!user) {
    return null;
  }

  return (
    <AccountMenuView
      user={user}
      isLoggingOut={logout.isPending}
      onLogout={handleLogout}
    />
  );
}
