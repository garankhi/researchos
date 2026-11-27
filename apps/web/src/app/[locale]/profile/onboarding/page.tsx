import { Suspense } from 'react';
import { RequireAuth } from '@/features/identity';
import { OnboardingFlow, OnboardingSkeleton } from '@/features/profiles';

/**
 * The onboarding screen.
 *
 * A researcher who has not finished the onboarding is routed here as
 * soon as they sign in — the gate in `RequireOnboarding` sends them
 * back to this route from every other screen.
 *
 * The route is behind the session guard: an onboarding belongs to
 * exactly one signed-in researcher.
 */
export default function OnboardingPage() {
  return (
    <Suspense fallback={<OnboardingSkeleton />}>
      <RequireAuth>
        <OnboardingFlow />
      </RequireAuth>
    </Suspense>
  );
}
