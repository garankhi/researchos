import { Suspense } from 'react';
import { RequireAuth } from '@/features/identity';
import {
  OpenAlexOnboarding,
  OpenAlexOnboardingSkeleton,
} from '@/features/openalex';

/**
 * The OpenAlex onboarding screen.
 *
 * A fresh researcher arrives here with only a name and an email. The
 * screen walks them through the two steps: confirming the OpenAlex
 * author, then importing the works.
 *
 * The route is behind the session guard — an onboarding belongs to
 * exactly one signed-in researcher.
 */
export default function OpenAlexOnboardingPage() {
  return (
    <Suspense fallback={<OpenAlexOnboardingSkeleton />}>
      <RequireAuth>
        <OpenAlexOnboarding />
      </RequireAuth>
    </Suspense>
  );
}
