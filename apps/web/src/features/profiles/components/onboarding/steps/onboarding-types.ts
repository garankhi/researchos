import type { OnboardingInterest } from '../../../hooks/use-onboarding';

/**
 * The props every onboarding step receives.
 *
 * The steps are siblings rather than one branching component: each step
 * owns its own layout, and the flow shell owns the navigation. A step
 * therefore receives the data it needs and nothing more.
 */
export interface OnboardingStepProps {
  /** The research interests the researcher already declared. */
  interests: OnboardingInterest[];
  /** Declares a research interest. */
  onDeclare: (topicId: string) => Promise<void>;
  /** Whether a declaration is in flight. */
  isDeclaring: boolean;
  /** Whether the interest list is still loading. */
  isLoading: boolean;
}
