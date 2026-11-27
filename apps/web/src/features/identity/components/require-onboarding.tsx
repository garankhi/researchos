'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useSession } from '../hooks/use-session';

/**
 * The onboarding gate.
 *
 * A researcher whose account has not finished the onboarding is sent to
 * the onboarding screen as soon as they are signed in. The gate sits
 * above the protected screens, so the redirection happens on the first
 * protected page the researcher opens after logging in — without the
 * researcher having to look for it.
 *
 * ## Why the gate waits instead of redirecting immediately
 *
 * The session check is asynchronous. The first render happens before
 * the answer arrives, so a redirect on "not signed in" would fire before
 * the check had even run. The gate therefore renders its children until
 * it knows the account, and only then decides.
 *
 * ## Why the onboarding screen itself is not gated
 *
 * The gate would send the researcher back to the onboarding screen from
 * the onboarding screen, in a loop. The route is therefore excluded
 * explicitly — the one place a researcher must be able to reach is the
 * place the onboarding itself lives.
 */
export function RequireOnboarding({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isChecking, isFailed } = useSession();

  const isOnboardingRoute = pathname.startsWith('/profile/onboarding');

  useEffect(() => {
    if (isChecking || isFailed) {
      return;
    }

    // A signed-out visitor is not ours to redirect — the session guard
    // on the screen itself shows the sign-in prompt.
    if (!user) {
      return;
    }

    if (user.onboardingCompleted || isOnboardingRoute) {
      return;
    }

    router.replace('/profile/onboarding');
  }, [
    isChecking,
    isFailed,
    user,
    isOnboardingRoute,
    router,
  ]);

  return <>{children}</>;
}
