'use client';

import { useMemo, useRef, useState } from 'react';
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
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import { useCurrentUser } from '@/features/identity';
import { useProfile } from '../../hooks/use-profile';
import {
  ONBOARDING_STEPS,
  useOnboarding,
  type OnboardingStep,
} from '../../hooks/use-onboarding';
import { useOnboardingLeaveGuard } from '../../hooks/use-onboarding-leave-guard';
import {
  createOnboardingDraftStore,
  type OnboardingDraftProfileValues,
} from '../../store/onboarding-draft-store';
import {
  OnboardingAuthorStep,
  toDraftOpenAlexAuthor,
} from './steps/onboarding-author-step';
import { OnboardingInterestsStep } from './steps/onboarding-interests-step';
import {
  OnboardingProfileStep,
  type OnboardingProfileFormHandle,
} from './steps/onboarding-profile-step';
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
   * The candidate the researcher picked in the author list.
   *
   * The selection lives here rather than in the author step, because
   * the *decision* is the flow's: the Next button confirms the picked
   * candidate and the Skip button leaves the step without one. The step
   * only shows the choice.
   */
  const [selectedAuthorId, setSelectedAuthorId] = useState<string | null>(null);

  /*
   * The profile form's handle.
   *
   * The flow's Next button saves the profile on the way out, so the
   * flow has to be able to reach the form. The ref is the seam: the
   * form owns the values and the rules, the flow owns the decision.
   */
  const profileFormRef = useRef<OnboardingProfileFormHandle | null>(null);

  /*
   * The draft is namespaced per researcher, so two accounts in the same
   * browser keep two drafts and neither sees the other's.
   */
  const draft = useMemo(() => createOnboardingDraftStore(user?.id), [user?.id]);

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

  /*
   * Confirms the candidate the researcher picked.
   *
   * The record rides along so the profile step can prefill from it
   * without asking OpenAlex a second time.
   */
  const confirmSelectedAuthor = () => {
    if (!selectedAuthorId) {
      return;
    }
    const chosen = onboarding.authors.find(
      (author) => author.shortId === selectedAuthorId,
    );
    if (!chosen) {
      return;
    }
    draft
      .getState()
      .confirmAuthor(
        selectedAuthorId,
        chosen.orcid ?? null,
        toDraftOpenAlexAuthor(chosen),
      );
  };

  /*
   * The steps that may be skipped.
   *
   * The interests are mandatory — the server refuses the completion
   * without one — so they have no Skip button. The last step has none
   * either: there is no step to skip to, and its optional content is
   * already optional.
   */
  const canSkip = step !== 'interests' && !isLastStep;

  /*
   * What the Next button does on the step the researcher is on.
   *
   * Next is the one button that moves on, so it is also the one that
   * keeps what the researcher entered:
   *
   * - **The author step.** It confirms the picked candidate. A
   *   researcher who picked nothing simply moves on, which is the same
   *   as skipping — there is nothing to confirm.
   * - **The profile step.** It saves the form and moves on. The form
   *   validates itself, so an invalid field is reported next to the
   *   input and the step is not left.
   * - **The other steps.** They have nothing to keep.
   */
  const handleNext = () => {
    if (!canAdvance) {
      return;
    }

    if (step === 'author') {
      confirmSelectedAuthor();
    }

    if (step === 'profile') {
      /*
       * The form validates and reports itself; the values land in the
       * draft through the step's own callback, and the step moves on
       * once they do.
       *
       * The ref is null only if the form has not mounted yet, which
       * cannot happen while the profile step is on screen — but the
       * step must not be left in place with no way out if it ever did.
       */
      const form = profileFormRef.current;
      if (form) {
        form.submit();
        return;
      }
    }

    const next = ONBOARDING_STEPS[stepIndex + 1];
    if (next) {
      setStep(next);
    }
  };

  /*
   * The Skip button.
   *
   * It leaves the step without an answer. On the author step that
   * means no author is confirmed; on the profile step it means the
   * form is left as it is — the values are not saved.
   */
  const handleSkip = () => {
    if (step === 'author') {
      draft.getState().clearAuthor();
      setSelectedAuthorId(null);
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
  /*
   * The affiliation timeline the researcher edited, or null when they
   * never touched it.
   *
   * Null is not the same as an empty list: null means the timeline was
   * left alone, and the finalize call then says nothing about the
   * affiliations, so the rows the OpenAlex sync wrote stay as they
   * are.
   */
  const draftAffiliationValues = draft((state) => state.affiliationValues);

  /*
   * Whether the researcher has anything to lose.
   *
   * The draft lives in memory, so a navigation empties it. The guard is
   * only armed once there is an answer worth keeping: a picked
   * interest, a confirmed author, a filled profile, an edited
   * affiliation timeline or a decision on a work. A researcher who has
   * answered nothing is never interrupted.
   */
  const hasUnsavedWork = draft(
    (state) =>
      state.topicIds.length > 0 ||
      state.confirmedAuthorId !== null ||
      state.profileValues !== null ||
      state.affiliationValues !== null ||
      Object.keys(state.workDecisions).length > 0,
  );

  /*
   * The guard is off once the onboarding has been written. The draft is
   * emptied on the same path, but the flag is explicit: the flow may
   * still be mounted while the page changes, and a warning on the way
   * out of a finished onboarding would be noise.
   */
  const [isFinalized, setIsFinalized] = useState(false);

  const leaveGuard = useOnboardingLeaveGuard({
    isActive: hasUnsavedWork && !isFinalized,
  });

  /*
   * The profile values are recorded in the draft and the step moves on.
   *
   * There is no confirmation snackbar here: nothing was written. The
   * draft is a scratch space until the researcher presses Finish, and
   * the step change already says the answers were kept — a toast that
   * says "your information was kept" while nothing was saved only
   * invites the reader to wonder what "saved" meant.
   */
  const handleSaveProfile = (values: OnboardingDraftProfileValues) => {
    draft.getState().setProfileValues(values);
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
      setIsFinalized(true);
      showSnackbar({ message: t('finished'), severity: 'success' });
      onFinish?.();
    } catch {
      // The server refused — almost always because the mandatory
      // interest is missing, which the interest step already prevents.
      showSnackbar({ message: t('finishFailed'), severity: 'error' });
    }
  };

  return (
    /*
     * The screen is split the way the profile page is split: a white
     * header band that holds the framing — the welcome, the progress
     * bar and the step buttons — and a grey canvas below that holds
     * the work of the current step.
     *
     * The header is full bleed so it reads as one band across the
     * viewport, while the content inside it stays at the same width as
     * the profile page.
     *
     * The band is pinned to the top of the viewport and the content
     * scrolls beneath it: the step buttons are how the researcher moves
     * between steps, and they must stay reachable no matter how long
     * the work of the current step is.
     */
    <Box
      as="main"
      flex="1"
      bg="home.background"
      minH="100dvh"
      /*
       * The fixed navigation bar covers the bottom of the canvas, so
       * the content stops above it rather than under it.
       */
      pb="20"
    >
      <Box
        position="sticky"
        top="0"
        zIndex="sticky"
        bg="bg.panel"
        borderBottomWidth="1px"
        borderColor="border"
      >
        <Container
          maxW="64rem"
          px={{ base: '4', md: '6' }}
          pt={{ base: '5', md: '8' }}
          pb={{ base: '4', md: '6' }}
        >
          <Stack gap="6">
            <Box>
              <Heading as="h1" size="lg" fontWeight="bold">
                {t('title')}
              </Heading>
              <Text textStyle="sm" color="fg.muted" mt="2">
                {t('description')}
              </Text>
            </Box>

            {/*
             * The progress bar.
             *
             * The palette is set explicitly: the body carries `gray`, so
             * the bar would otherwise be a grey line in a screen that is
             * otherwise blue. It is the one thing that says how far along
             * the researcher is, and it reads as progress rather than as a
             * divider.
             */}
            <Progress.Root
              value={(stepIndex / (ONBOARDING_STEPS.length - 1)) * 100}
              size="sm"
              colorPalette="blue"
            >
              <Progress.Track>
                <Progress.Range />
              </Progress.Track>
            </Progress.Root>

            <Flex
              gap="2"
              flexWrap="wrap"
              role="tablist"
              aria-label={t('title')}
            >
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
                  disabled={!hasMandatoryInterest && candidate !== 'interests'}
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
          </Stack>
        </Container>
      </Box>

      {/*
       * The body of the flow. It sits on the grey canvas — the same
       * grey the profile page uses for its workspace — so the white
       * header above reads as a separate band rather than as a
       * continuation of the same sheet.
       */}
      <Box bg="home.background" flex="1">
        <Container
          maxW="64rem"
          px={{ base: '4', md: '6' }}
          py={{ base: '4', lg: '6' }}
        >
          <Stack gap="6">
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
                selectedAuthorId={selectedAuthorId}
                onSelect={setSelectedAuthorId}
              />
            ) : null}

            {step === 'profile' ? (
              <OnboardingProfileStep
                profile={profileQuery.profile ?? null}
                /*
                 * The profile is still coming. The step shows the cards
                 * of the form rather than an empty page, so the
                 * researcher sees the fields arriving instead of a
                 * blank screen that fills in later.
                 */
                isLoading={profileQuery.isLoading}
                /*
                 * The flag says whether the form was prefilled from OpenAlex,
                 * and only the record can do that. A confirmed author id on
                 * its own is not enough: a researcher who reaches this step
                 * through the step tabs never triggered the author step's
                 * confirm, so the record was never fetched and nothing was
                 * prefilled — the flag must not claim otherwise.
                 */
                prefillFromOpenAlex={openAlexAuthor !== null}
                openAlexOrcid={onboarding.openAlexOrcid}
                openAlexAuthor={openAlexAuthor}
                confirmedAuthorId={onboarding.confirmedAuthorId}
                draftValues={draftProfileValues}
                affiliationValues={draftAffiliationValues}
                onAffiliationChange={(values) =>
                  draft.getState().setAffiliationValues(values)
                }
                onSave={handleSaveProfile}
                formRef={profileFormRef}
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
              />
            ) : null}
          </Stack>
        </Container>
      </Box>

      {/*
       * The navigation bar.
       *
       * Every step has the same three buttons: Back on the left, and
       * Skip and Next on the right. The Skip button sits immediately
       * left of Next, because the two are alternatives — skip the step,
       * or complete it and move on — and the researcher should read them
       * as a pair rather than hunt for a third button inside the step
       * itself.
       *
       * The bar is fixed to the bottom of the viewport: the way forward
       * is the one thing the researcher must never have to scroll for,
       * and a step whose content runs long would otherwise hide it.
       */}
      <Box
        position="fixed"
        insetInline="0"
        bottom="0"
        zIndex="sticky"
        bg="bg.panel"
        borderTopWidth="1px"
        borderColor="border"
        pb="env(safe-area-inset-bottom)"
      >
        <Container
          maxW="64rem"
          px={{ base: '4', md: '6' }}
          py={{ base: '3', md: '4' }}
        >
          <Flex justify="space-between" gap="3" flexWrap="wrap">
            <Button
              variant="outline"
              onClick={goBack}
              disabled={stepIndex === 0}
            >
              <ArrowLeft />
              {tCommon('back')}
            </Button>

            <Flex gap="3">
              {canSkip ? (
                <Button variant="outline" onClick={handleSkip}>
                  {t('skip')}
                </Button>
              ) : null}

              {isLastStep ? (
                <Button
                  onClick={() => void handleFinish()}
                  loading={onboarding.isFinalizing}
                >
                  <Check />
                  {t('finish')}
                </Button>
              ) : (
                <Button onClick={handleNext} disabled={!canAdvance}>
                  {tCommon('next')}
                  <ArrowRight />
                </Button>
              )}
            </Flex>
          </Flex>
        </Container>
      </Box>

      {/*
       * The leave guard's confirmation. It replaces the browser's own
       * dialog for an in-app navigation, so the researcher is told what
       * they are about to lose.
       */}
      <ConfirmationModal
        open={leaveGuard.isConfirmOpen}
        onClose={leaveGuard.cancelLeave}
        title={t('leaveGuard.title')}
        description={t('leaveGuard.description')}
        confirmLabel={t('leaveGuard.confirm')}
        cancelLabel={t('leaveGuard.cancel')}
        onConfirm={leaveGuard.confirmLeave}
        colorPalette="orange"
        role="alertdialog"
      />
    </Box>
  );
}
