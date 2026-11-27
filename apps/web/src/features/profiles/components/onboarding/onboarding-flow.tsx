'use client';

import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Container,
  Flex,
  Heading,
  Progress,
  Stack,
  Text,
} from '@chakra-ui/react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import { useCurrentUser } from '@/features/identity';
import { useProfile } from '../../hooks/use-profile';
import {
  ONBOARDING_STEPS,
  useOnboarding,
  type OnboardingStep,
} from '../../hooks/use-onboarding';
import {
  createOnboardingDraftStore,
  type OnboardingDraftOpenAlexAuthor,
  type OnboardingDraftProfileValues,
} from '../../store/onboarding-draft-store';import { OnboardingAuthorStep } from './steps/onboarding-author-step';
import { OnboardingInterestsStep } from './steps/onboarding-interests-step';
import { OnboardingProfileStep } from './steps/onboarding-profile-step';
import { OnboardingWorksStep } from './steps/onboarding-works-step';

/**
 * The onboarding of a fresh researcher.
 *
 * The flow has four steps, and only the first one is mandatory:
 *
 * 1. **The research interests.** Mandatory. The researcher picks at
 *    least one; the server refuses the completion without one.
 * 2. **The OpenAlex author.** Optional. The platform searched OpenAlex
 *    by the researcher's name at FPT University; the researcher confirms
 *    the one that is theirs, or skips.
 * 3. **The profile.** Optional. The information is prefilled when the
 *    author was confirmed in step 2, and the form is empty otherwise.
 *    Either way the researcher may skip it.
 * 4. **The candidate works.** Optional. The researcher accepts the
 *    works that are theirs, or rejects them.
 *
 * ## Why the whole flow is a draft
 *
 * Nothing is written until the researcher presses **Finish**. Every
 * answer — the interests, the author, the profile, the decisions on the
 * works — travels together in one call, and the server writes them in
 * one go.
 *
 * The alternative would be to write each answer as it is given. That
 * leaves the platform holding a half-finished researcher: an interest
 * with no profile, a profile with no works, a work the researcher is
 * about to reject. It also makes every choice irreversible, because the
 * researcher cannot take back a topic they picked by mistake.
 *
 * ## Why the steps share one screen
 *
 * A researcher who wants to change the interest they picked in step 1
 * while looking at the works in step 4 should not have to go back
 * through the whole flow to do it — so the step buttons stay visible,
 * and the mandatory rule is the only thing that stops the flow.
 */
export function OnboardingFlow({
  onFinish,
}: {
  /** Called when the researcher leaves the flow. */
  onFinish?: () => void;
}) {
  const t = useTranslations('onboarding');
  const tCommon = useTranslations('common');
  const { showSnackbar } = useSnackbar();
  const user = useCurrentUser();

  const [step, setStep] = useState<OnboardingStep>('interests');

  /*
   * The visibility an accepted work is published with. It is a single
   * choice for the whole step — a researcher publishes their accepted
   * works the same way, or the visibility picker is noise.
   */
  const [visibility, setVisibility] = useState<
    'PRIVATE' | 'FPTU_COMMUNITY'
  >('PRIVATE');

  /*
   * The draft is namespaced per researcher, so two accounts in the same
   * browser keep two drafts and neither sees the other's.
   */
  const draft = useMemo(
    () => createOnboardingDraftStore(user?.id),
    [user?.id],
  );

  const profileQuery = useProfile({
    userId: user?.id,
    isOwner: true,
  });

  const onboarding = useOnboarding({
    step,
    draft,
  });

  const stepIndex = ONBOARDING_STEPS.indexOf(step);

  /*
   * The mandatory step. The researcher cannot leave step 1 without at
   * least one interest — the button is disabled and the server refuses
   * the completion, so the two rules cannot drift apart.
   */
  const hasMandatoryInterest = onboarding.topicIds.length > 0;

  const canAdvance = useMemo(
    () => (step === 'interests' ? hasMandatoryInterest : true),
    [step, hasMandatoryInterest],
  );

  const isLastStep = stepIndex === ONBOARDING_STEPS.length - 1;

  const goNext = () => {
    if (!canAdvance) {
      return;
    }
    const next = ONBOARDING_STEPS[stepIndex + 1];
    if (next) {
      setStep(next);
    }
  };

  const goBack = () => {
    const previous = ONBOARDING_STEPS[stepIndex - 1];
    if (previous) {
      setStep(previous);
    }
  };

  /*
   * The topic names the badges show. They are read from the draft,
   * because the draft carries the name alongside the id — the id is what
   * the finalize call needs, and the name is what the researcher reads.
   */
  const topicNames = draft((state) => state.topicNames);
  const draftProfileValues = draft((state) => state.profileValues);
  /*
   * The OpenAlex record of the confirmed author. The profile step
   * prefills from it, so the researcher starts from what OpenAlex holds
   * and corrects it rather than typing everything.
   */
  const openAlexAuthor = draft((state) => state.openAlexAuthor);

  const handleConfirmAuthor = (
    shortId: string,
    orcid: string | null,
    author: OnboardingDraftOpenAlexAuthor | null,
  ) => {
    draft.getState().confirmAuthor(shortId, orcid, author);
    setStep('profile');
  };

  const handleSkipAuthor = () => {
    draft.getState().clearAuthor();
    setStep('profile');
  };

  const handleSaveProfile = (values: OnboardingDraftProfileValues) => {
    draft.getState().setProfileValues(values);
    showSnackbar({ message: t('profileStep.saved'), severity: 'success' });
    setStep('works');
  };

  const handleFinish = async () => {
    try {
      /*
       * The finalize is the last write: the interest rule is enforced
       * there, so the flow cannot end without it.
       */
      await onboarding.finalizeOnboarding();
      draft.getState().reset();
      showSnackbar({ message: t('finished'), severity: 'success' });
      onFinish?.();
    } catch {
      // The server refused — almost always because the mandatory
      // interest is missing, which the interest step already prevents.
      showSnackbar({ message: t('finishFailed'), severity: 'error' });
    }
  };

  return (
    <Container maxW={{ base: '48rem', lg: '68rem' }} py={{ base: '6', md: '10' }}>
      <Stack gap="6">
        <Box>
          <Heading as="h1" size="lg" fontWeight="bold">
            {t('title')}
          </Heading>
          <Text textStyle="sm" color="fg.muted" mt="2">
            {t('description')}
          </Text>
        </Box>

        <Progress.Root
          value={(stepIndex / (ONBOARDING_STEPS.length - 1)) * 100}
          size="sm"
        >
          <Progress.Track>
            <Progress.Range />
          </Progress.Track>
        </Progress.Root>

        <Flex gap="2" flexWrap="wrap" role="tablist" aria-label={t('title')}>
          {ONBOARDING_STEPS.map((candidate) => (
            <Button
              key={candidate}
              role="tab"
              size="xs"
              variant={candidate === step ? 'solid' : 'ghost'}
              aria-selected={candidate === step}
              /*
               * The mandatory rule stops the flow at step 1. Without it
               * the researcher could click straight past the interests
               * step — the Next button was disabled, but the tab was
               * not.
               */
              disabled={
                !hasMandatoryInterest && candidate !== 'interests'
              }
              onClick={() => setStep(candidate)}
            >
              {t(`steps.${candidate}.label`)}
              {candidate === 'interests' ? (
                <Text textStyle="xs" ms="1">
                  {t('steps.interests.mandatory')}
                </Text>
              ) : null}
            </Button>
          ))}
        </Flex>

        {step === 'interests' ? (
          <OnboardingInterestsStep
            topicIds={onboarding.topicIds}
            topicNames={topicNames}
            onAdd={(topicId, topicName) =>
              draft.getState().addTopic(topicId, topicName)
            }
            onRemove={(topicId) => draft.getState().removeTopic(topicId)}
          />
        ) : null}

        {step === 'author' ? (
          <OnboardingAuthorStep
            authors={onboarding.authors}
            mode={onboarding.authorMode}
            isLoading={onboarding.isLoadingAuthors}
            isFailed={onboarding.isFailedAuthors}
            onRetry={onboarding.refetchAuthors}
            confirmedAuthorId={onboarding.confirmedAuthorId}
            onConfirm={handleConfirmAuthor}
            onSkip={handleSkipAuthor}
          />
        ) : null}

        {step === 'profile' ? (
          <OnboardingProfileStep
            profile={profileQuery.profile ?? null}
            prefillFromOpenAlex={onboarding.confirmedAuthorId !== null}
            openAlexOrcid={onboarding.openAlexOrcid}
            openAlexAuthor={openAlexAuthor}
            confirmedAuthorId={onboarding.confirmedAuthorId}
            draftValues={draftProfileValues}
            onSave={handleSaveProfile}
            onSkip={goNext}
          />
        ) : null}

        {step === 'works' ? (
          <OnboardingWorksStep
            works={onboarding.works}
            isLoading={onboarding.isLoadingWorks}
            isFailed={onboarding.isFailedWorks}
            onRetry={onboarding.refetchWorks}
            decisions={onboarding.workDecisions}
            onDecide={(workId, accepted, visibility) =>
              draft.getState().decideWork(workId, accepted, visibility)
            }
            onUndecide={(workId) => draft.getState().undecideWork(workId)}
            visibility={visibility}
            onVisibilityChange={setVisibility}
          />
        ) : null}

        <Flex justify="space-between" gap="3" flexWrap="wrap">
          <Button variant="outline" onClick={goBack} disabled={stepIndex === 0}>
            <ArrowLeft />
            {tCommon('back')}
          </Button>

          <Flex gap="3">
            {isLastStep ? (
              <Button
                onClick={() => void handleFinish()}
                loading={onboarding.isFinalizing}
              >
                <Check />
                {t('finish')}
              </Button>
            ) : (
              <Button onClick={goNext} disabled={!canAdvance}>
                {tCommon('next')}
                <ArrowRight />
              </Button>
            )}
          </Flex>
        </Flex>
      </Stack>
    </Container>
  );
}
