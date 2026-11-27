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
import type { OnboardingProfileValues } from '../../schemas/onboarding-profile.schema';
import { OnboardingAuthorStep } from './steps/onboarding-author-step';
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
 * ## Why the steps share one screen
 *
 * A researcher who wants to change the interest they picked in step 1
 * while looking at the works in step 4 should not have to go back
 * through the whole flow to do it — so the step buttons stay visible,
 * and the mandatory rule is the only thing that stops the flow.
 *
 * ## Why the completion is written twice
 *
 * The profile step writes the profile, and the last step writes the
 * completion flag. The write is idempotent — it sets the same fields
 * and the same timestamp — so a researcher who saves the profile and
 * then leaves without finishing still has their information stored, and
 * the gate sends them back to the last step rather than to the start.
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
  const [confirmedAuthorId, setConfirmedAuthorId] = useState<string | null>(
    null,
  );
  const [openAlexOrcid, setOpenAlexOrcid] = useState<string | null>(null);

  const profileQuery = useProfile({
    userId: user?.id,
    isOwner: true,
  });

  const onboarding = useOnboarding({
    step,
    userId: user?.id,
  });

  const stepIndex = ONBOARDING_STEPS.indexOf(step);

  /*
   * The mandatory step. The researcher cannot leave step 1 without at
   * least one interest — the button is disabled and the server refuses
   * the completion, so the two rules cannot drift apart.
   */
  const hasMandatoryInterest = onboarding.interests.length > 0;

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

  const handleConfirmAuthor = async (shortId: string) => {
    await onboarding.confirmAuthor(shortId);
    setConfirmedAuthorId(shortId);

    /*
     * The ORCID OpenAlex reports for the confirmed author prefills the
     * profile step. It is read from the author list the step already
     * loaded, so it costs no extra request.
     */
    const confirmed = onboarding.authors.find(
      (author) => author.shortId === shortId,
    );
    setOpenAlexOrcid(confirmed?.orcid ?? null);

    showSnackbar({ message: t('authorStep.pulled'), severity: 'success' });
    setStep('profile');
  };

  const handleSkipAuthor = async () => {
    await onboarding.pullWithoutAuthor();
    showSnackbar({ message: t('authorStep.pulled'), severity: 'success' });
    setStep('profile');
  };

  const handleSaveProfile = async (values: OnboardingProfileValues) => {
    await onboarding.completeOnboarding({
      fullName: values.fullName,
      departmentUnit: values.departmentUnit,
      academicTitle: values.academicTitle,
      academicDegree: values.academicDegree,
      orcidId: values.orcidId,
      bio: values.bio ?? undefined,
      availabilityStatus: values.availabilityStatus,
      googleScholarUrl: values.googleScholarUrl ?? undefined,
      scopusAuthorId: values.scopusAuthorId ?? undefined,
    });
    showSnackbar({ message: t('profileStep.saved'), severity: 'success' });
    setStep('works');
  };

  const handleFinish = async () => {
    try {
      // The completion is the last write: the interest rule is enforced
      // there, so the flow cannot end without it.
      await onboarding.completeOnboarding({});
      showSnackbar({ message: t('finished'), severity: 'success' });
      onFinish?.();
    } catch {
      // The server refused — almost always because the mandatory
      // interest is missing, which the interest step already prevents.
      showSnackbar({ message: t('finishFailed'), severity: 'error' });
    }
  };

  return (
    <Container maxW="48rem" py={{ base: '6', md: '10' }}>
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
          {ONBOARDING_STEPS.map((candidate, index) => (
            <Button
              key={candidate}
              role="tab"
              size="xs"
              variant={candidate === step ? 'solid' : 'ghost'}
              aria-selected={candidate === step}
              disabled={index > stepIndex + 1}
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
            interests={onboarding.interests}
            onDeclare={onboarding.declareInterest}
            isDeclaring={onboarding.isDeclaringInterest}
            isLoading={onboarding.isLoadingInterests}
          />
        ) : null}

        {step === 'author' ? (
          <OnboardingAuthorStep
            authors={onboarding.authors}
            mode={onboarding.authorMode}
            isLoading={onboarding.isLoadingAuthors}
            isFailed={onboarding.isFailedAuthors}
            isPulling={onboarding.isPulling}
            onRetry={onboarding.refetchAuthors}
            onConfirm={handleConfirmAuthor}
            onSkip={handleSkipAuthor}
          />
        ) : null}

        {step === 'profile' ? (
          <OnboardingProfileStep
            profile={profileQuery.profile ?? null}
            prefillFromOpenAlex={confirmedAuthorId !== null}
            openAlexOrcid={openAlexOrcid}
            confirmedAuthorId={confirmedAuthorId}
            isSaving={onboarding.isCompleting}
            onSave={handleSaveProfile}
            onSkip={goNext}
          />
        ) : null}

        {step === 'works' ? (
          <OnboardingWorksStep
            candidates={onboarding.candidates}
            isLoading={onboarding.isLoadingCandidates}
            isFailed={onboarding.isFailedCandidates}
            isPulling={onboarding.isPulling}
            isDeciding={onboarding.isDeciding}
            onRetry={onboarding.refetchCandidates}
            onFetchMore={() => onboarding.pullWithoutAuthor()}
            onAccept={async (work, visibility) => {
              await onboarding.acceptWork(work.id, { visibility });
            }}
            onReject={async (work) => {
              await onboarding.rejectWork(work.id);
            }}
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
                loading={onboarding.isCompleting}
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
