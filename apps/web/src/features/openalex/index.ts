/**
 * OpenAlex feature — public entry point.
 *
 * The onboarding of a fresh researcher: the OpenAlex author confirmation
 * and the works import. This barrel is the only import surface other
 * modules should use.
 */

export { OpenAlexOnboarding } from './components/openalex-onboarding';
export { OpenAlexOnboardingSkeleton } from './components/openalex-onboarding-skeleton';
export {
  useOnboardingCandidates,
  useOpenAlexOnboarding,
} from './hooks/use-openalex-onboarding';
