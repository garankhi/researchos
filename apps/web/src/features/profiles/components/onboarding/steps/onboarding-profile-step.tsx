'use client';

import { useImperativeHandle, useMemo, useState, type Ref } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Badge, Box, Flex, Heading, Stack, Text } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { FormSelect, FormTextarea, FormTextField } from '@/components/ui/form';
import { ErrorState } from '@/components/ui/feedback';
import type { OnboardingAffiliationDto } from '@/lib/api/models';
import {
  onboardingProfileSchema,
  type OnboardingProfileValues,
} from '../../../schemas/onboarding-profile.schema';
import { availabilityStatusValues } from '../../../schemas/profile-form.schema';
import type { ProfileResponseDto } from '../../../types';
import type {
  OnboardingDraftOpenAlexAuthor,
  OnboardingDraftProfileValues,
} from '../../../store/onboarding-draft-store';
import { OnboardingAffiliationTimeline } from './onboarding-affiliation-timeline';
import { OnboardingProfileStepSkeleton } from './onboarding-step-skeletons';

/**
 * The props of the profile step.
 */
export interface OnboardingProfileStepProps {
  /** The researcher's current profile, read from the API. */
  profile: ProfileResponseDto | null;
  /**
   * Whether the profile is still being read.
   *
   * The form is prefilled from the profile, so it cannot be shown until
   * the profile has arrived — an empty form would be prefilled a moment
   * later, and the researcher would watch their own text move. The step
   * shows the shape of the form instead.
   */
  isLoading?: boolean;
  /**
   * Whether the form was prefilled from OpenAlex.
   *
   * It is honest about the OpenAlex record: it is true only when the
   * record itself is there. The author step is optional and the
   * researcher may reach this step through the step tabs, so a
   * confirmed author id does not by itself mean anything was
   * prefilled — only the record does.
   *
   * The step's own copy follows this flag, so it never claims the form
   * was filled from OpenAlex when it was not.
   */
  prefillFromOpenAlex: boolean;
  /** The ORCID OpenAlex reports for the confirmed author, if any. */
  openAlexOrcid: string | null;
  /**
   * The OpenAlex record of the confirmed author.
   *
   * It is what the step prefills from: the display name, the byline
   * spellings, the topics, the affiliations and the citation metrics.
   * Null when the researcher skipped the author step.
   */
  openAlexAuthor: OnboardingDraftOpenAlexAuthor | null;
  /** The OpenAlex author id the researcher confirmed, if any. */
  confirmedAuthorId: string | null;
  /**
   * The values the researcher already entered in the draft.
   *
   * They are prefilled into the form, so a researcher who goes back to
   * the step finds their own text rather than the prefilled one.
   */
  draftValues: OnboardingDraftProfileValues | null;
  /**
   * The affiliation timeline the researcher edited, or null when they
   * never touched it.
   */
  affiliationValues: OnboardingAffiliationDto[] | null;
  /** Records the edited affiliation timeline. */
  onAffiliationChange: (values: OnboardingAffiliationDto[] | null) => void;
  /**
   * The handle the flow uses to reach the form.
   *
   * The flow's Next button is the one that saves the profile, so the
   * flow has to be able to ask the form to validate and hand its
   * values over.
   */
  formRef?: Ref<OnboardingProfileFormHandle>;
  /** Records the values in the draft. */
  onSave: (values: OnboardingDraftProfileValues) => void;
}

/**
 * The bare form of the ORCID, without the `https://orcid.org/` prefix.
 *
 * The profile stores the bare form, and OpenAlex reports the URL form.
 * The step prefills from OpenAlex, so the value has to be reduced to
 * the bare form before it lands in the input.
 */
function bareOrcid(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  return value
    .trim()
    .replace(/^(https?:\/\/(dx\.)?orcid\.org\/|orcid:\s*)/i, '')
    .trim();
}

/**
 * What the flow can do with the profile form.
 *
 * The form is owned by the step, but the *decision* to keep the values
 * belongs to the flow — its Next button is the one that moves on, and
 * it has to save the form on the way. The handle is how the flow
 * reaches the form without owning it.
 */
export interface OnboardingProfileFormHandle {
  /**
   * Validates the form and hands the values over.
   *
   * The values only arrive when the form is valid: a researcher who
   * typed a malformed ORCID is told about it next to the input, and
   * the step is not left.
   */
  submit: () => void;
}

/**
 * The third step of the onboarding: the profile information.
 *
 * The step is **optional**, and it changes shape depending on what
 * happened in the step before it:
 *
 * - **The OpenAlex author was confirmed.** The record OpenAlex holds is
 *   shown in full — the name, the byline spellings, the topics, the
 *   affiliations, the metrics, the recent works — and the fields the
 *   researcher may correct are prefilled from it. The researcher checks
 *   the record and fixes what is wrong, rather than typing everything.
 * - **The author step was skipped or nothing was confirmed.** The form
 *   is empty apart from what the account already carries, and the
 *   researcher fills in what they want to publish.
 *
 * Either way the form writes to the same place: the account fields land
 * on `users`, the profile fields on `researcher_profiles`.
 */
export function OnboardingProfileStep({
  profile,
  isLoading = false,
  prefillFromOpenAlex,
  openAlexOrcid,
  openAlexAuthor,
  confirmedAuthorId,
  draftValues,
  affiliationValues,
  onAffiliationChange,
  formRef,
  onSave,
}: OnboardingProfileStepProps) {
  const t = useTranslations('onboarding');

  /*
   * The prefill sources, per field.
   *
   * The order is the same everywhere: the researcher's own draft value
   * wins, then what OpenAlex knows, then what the account already
   * carries, and finally nothing at all — the field is left for the
   * researcher to fill.
   *
   * OpenAlex only knows a name and an ORCID. Every other field is
   * either absent from the record or is something the platform owns,
   * so it is never guessed: a department is not an institution, and a
   * title is not a degree.
   */
  const defaults = useMemo<OnboardingProfileValues>(() => {
    /*
     * The ORCID comes from the record first and from the confirmed
     * author's ORCID second. It is reduced to the bare form the profile
     * stores.
     *
     * An author without an ORCID leaves the field to the account's own
     * value — never a guess.
     */
    const openAlexOrcidValue = bareOrcid(
      openAlexAuthor?.orcid ?? openAlexOrcid,
    );

    return {
      fullName:
        draftValues?.fullName ??
        openAlexAuthor?.displayName ??
        profile?.fullName ??
        '',
      departmentUnit:
        draftValues?.departmentUnit ?? profile?.departmentUnit ?? '',
      academicTitle: draftValues?.academicTitle ?? profile?.academicTitle ?? '',
      academicDegree:
        draftValues?.academicDegree ?? profile?.academicDegree ?? '',
      orcidId:
        draftValues?.orcidId ??
        (openAlexOrcidValue || bareOrcid(profile?.orcidId)),
      bio: draftValues?.bio ?? profile?.bio ?? '',
      availabilityStatus:
        draftValues?.availabilityStatus ??
        profile?.availabilityStatus ??
        'NOT_AVAILABLE',
      googleScholarUrl:
        draftValues?.googleScholarUrl ?? profile?.googleScholarUrl ?? '',
      scopusAuthorId:
        draftValues?.scopusAuthorId ?? profile?.scopusAuthorId ?? '',
    };
  }, [draftValues, openAlexAuthor, openAlexOrcid, profile]);

  /*
   * The form is remounted when the confirmed author changes.
   *
   * The form's state belongs to one author: the name and the ORCID in
   * it were prefilled from that author's OpenAlex record. A different
   * author means a different set of prefilled values, so the form
   * starts again from the new record rather than keeping the old
   * author's text. The draft drops the saved values for the same
   * reason.
   *
   * This is keyed on the author rather than on the values, because the
   * values change for a second reason as well — the profile query
   * resolves after the first render — and that one must *not* wipe
   * what the researcher is typing.
   */
  const formKey = confirmedAuthorId ?? 'no-author';

  return (
    <Stack gap="5">
      <Box>
        <Heading as="h2" size="md" fontWeight="bold">
          {t('profileStep.title')}
        </Heading>
        <Text textStyle="sm" color="fg.muted" mt="2">
          {prefillFromOpenAlex
            ? t('profileStep.descriptionPrefilled')
            : t('profileStep.description')}
        </Text>
      </Box>

      {openAlexAuthor ? (
        <OnAlexPrefillPanel
          author={openAlexAuthor}
          confirmedAuthorId={confirmedAuthorId}
          affiliationValues={affiliationValues}
          onAffiliationChange={onAffiliationChange}
        />
      ) : null}

      {isLoading ? (
        /*
         * The profile is still being read, and the form is prefilled
         * from it. Showing the form now would show it empty, and the
         * researcher's own text would move a moment later when the
         * prefill arrives — so the step shows the cards of the form
         * instead, and the fields fill in once the profile does.
         */
        <OnboardingProfileStepSkeleton />
      ) : (
        <OnboardingProfileForm
          key={formKey}
          defaults={defaults}
          formRef={formRef}
          onSave={onSave}
        />
      )}
    </Stack>
  );
}

/**
 * The profile form itself.
 *
 * It is a component of its own so the step can remount it when the
 * confirmed author changes — a remount is the only way to give the
 * form a fresh set of default values without touching what the
 * researcher has typed.
 *
 * ## Why the form has no buttons
 *
 * The flow owns the buttons: one Next and one Skip, on every step. A
 * step that also carries a "Save my information" and a "Skip for now"
 * gives the researcher three ways to leave the same step, and no way to
 * tell which one is the intended one. So the form only exposes its
 * values through a ref, and the flow's Next button saves them.
 */
function OnboardingProfileForm({
  defaults,
  formRef,
  onSave,
}: {
  /** The values the form starts from. */
  defaults: OnboardingProfileValues;
  /** The handle the flow uses to read and validate the form. */
  formRef?: Ref<OnboardingProfileFormHandle>;
  /** Records the values in the draft. */
  onSave: (values: OnboardingDraftProfileValues) => void;
}) {
  const t = useTranslations('onboarding');
  const tAvailability = useTranslations('profile.availability');

  const [submitError, setSubmitError] = useState<string | null>(null);

  /*
   * The form follows the defaults as they change, and keeps what the
   * researcher typed.
   *
   * The profile query resolves asynchronously, so the first render has
   * no profile at all — the form would stay empty without this. The
   * `values` prop is what makes react-hook-form follow the defaults,
   * and `keepDirtyValues` is what keeps the researcher's own typing:
   * a field the researcher edited keeps their text, and only the
   * untouched fields take the newly arrived value. Without it, the
   * arriving profile would wipe what was typed.
   */
  const { control, handleSubmit } = useForm<OnboardingProfileValues>({
    resolver: zodResolver(onboardingProfileSchema),
    defaultValues: defaults,
    values: defaults,
    resetOptions: { keepDirtyValues: true },
  });

  const submit = handleSubmit((values) => {
    setSubmitError(null);
    onSave(values as OnboardingDraftProfileValues);
  });

  /*
   * The handle the flow reaches the form through.
   *
   * `useImperativeHandle` is the right tool here: the flow owns the
   * decision to leave the step, and the form owns the values. The
   * handle is the seam between the two — the flow asks the form to
   * validate and hand its values over, and the form stays in charge of
   * its own rules.
   */
  useImperativeHandle(
    formRef,
    () => ({
      submit: () => {
        void submit();
      },
    }),
    [submit],
  );

  return (
    <Stack gap="5">
      {submitError ? (
        <ErrorState title={t('profileStep.failed')} message={submitError} />
      ) : null}

      <form onSubmit={submit} noValidate>
        <Stack gap="4">
          {/*
           * The identity card: who the researcher is and where they
           * work. These are the fields the account carries, and they
           * are the ones a colleague looks up first.
           */}
          <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '5' }}>
            <Stack gap="4">
              <Text textStyle="sm" fontWeight="bold">
                {t('profileStep.identityCard')}
              </Text>

              <FormTextField
                name="fullName"
                label={t('profileStep.fullName')}
                control={control}
              />

              <FormTextField
                name="departmentUnit"
                label={t('profileStep.departmentUnit')}
                control={control}
              />

              <Stack direction={{ base: 'column', sm: 'row' }} gap="4">
                <FormTextField
                  name="academicTitle"
                  label={t('profileStep.academicTitle')}
                  control={control}
                  wrapperProps={{ flex: '1', minW: '0' }}
                />
                <FormTextField
                  name="academicDegree"
                  label={t('profileStep.academicDegree')}
                  control={control}
                  wrapperProps={{ flex: '1', minW: '0' }}
                />
              </Stack>

              <FormTextField
                name="orcidId"
                label={t('profileStep.orcidId')}
                placeholder="0000-0000-0000-0000"
                control={control}
              />
            </Stack>
          </Box>

          {/*
           * The publication card: the identifiers that link the
           * researcher to their work elsewhere, and how available they
           * are for collaboration.
           */}
          <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '5' }}>
            <Stack gap="4">
              <Text textStyle="sm" fontWeight="bold">
                {t('profileStep.publicationsCard')}
              </Text>

              <FormTextField
                name="googleScholarUrl"
                label={t('profileStep.googleScholarUrl')}
                placeholder="https://scholar.google.com/citations?user=..."
                control={control}
              />

              <FormTextField
                name="scopusAuthorId"
                label={t('profileStep.scopusAuthorId')}
                placeholder="57200000000"
                control={control}
              />

              <FormSelect
                name="availabilityStatus"
                label={t('profileStep.availabilityStatus')}
                control={control}
              >
                {availabilityStatusValues.map((status) => (
                  <option key={status} value={status}>
                    {tAvailability(status)}
                  </option>
                ))}
              </FormSelect>
            </Stack>
          </Box>

          {/*
           * The biography card. It stands on its own because it is the
           * one field with no value to prefill — it is entirely the
           * researcher's own words.
           */}
          <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '5' }}>
            <Stack gap="4">
              <Text textStyle="sm" fontWeight="bold">
                {t('profileStep.biographyCard')}
              </Text>

              <FormTextarea
                name="bio"
                label={t('profileStep.bio')}
                rows={4}
                control={control}
              />
            </Stack>
          </Box>
        </Stack>
      </form>
    </Stack>
  );
}

/**
 * The OpenAlex record of the confirmed author.
 *
 * ## Why it is shown here
 *
 * The author step showed this record so the researcher could recognise
 * themselves in it. Here it is shown again, next to the fields, so the
 * researcher can correct the profile against it — a typo in the display
 * name is fixed against the name OpenAlex has, not from memory.
 *
 * ## Why the record is split into cards
 *
 * The record holds three different kinds of thing, and reading them as
 * one block is what made it feel like a wall:
 *
 * - **The identity** — the name and the metrics. This is who OpenAlex
 *   thinks the researcher is.
 * - **The career** — the affiliation timeline, the byline spellings
 *   and the topics. This is what the researcher worked on, and it is
 *   the part they may correct.
 * - **The person's own fields** — the name, the department, the ORCID,
 *   the biography. These are the platform's, not OpenAlex's.
 *
 * A card per kind makes the boundary visible: the part the researcher
 * owns is the part with inputs in it.
 *
 * ## What is editable
 *
 * The **affiliation timeline** is editable, and it is the only part
 * that is. Where the researcher was and until when is their own
 * career, and OpenAlex regularly gets it wrong — it reports the
 * institution of the latest *authorship*, which for a researcher who
 * has moved is the one they left.
 *
 * The byline spellings, the topics and the metrics stay read-only:
 * they are OpenAlex's, and the platform does not own them. They are
 * shown for the researcher's reference.
 */
function OnAlexPrefillPanel({
  author,
  confirmedAuthorId,
  affiliationValues,
  onAffiliationChange,
}: {
  author: OnboardingDraftOpenAlexAuthor;
  confirmedAuthorId: string | null;
  /** The affiliation timeline the researcher edited, or null. */
  affiliationValues: OnboardingAffiliationDto[] | null;
  /** Records the edited affiliation timeline. */
  onAffiliationChange: (values: OnboardingAffiliationDto[] | null) => void;
}) {
  const t = useTranslations('onboarding.profileStep.prefill');

  const counts = author.counts;
  const hasCounts =
    counts.citedByCount !== null ||
    counts.hIndex !== null ||
    counts.i10Index !== null ||
    counts.twoYearMeanCitedness !== null;

  return (
    <Stack gap="4">
      {/*
       * The identity card. It says who OpenAlex believes the researcher
       * is, and the metrics are the evidence for that belief.
       */}
      <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '5' }}>
        <Stack gap="4">
          <Box>
            <Flex gap="2" align="center" flexWrap="wrap">
              <Text textStyle="sm" fontWeight="bold">
                {t('title')}
              </Text>
              {confirmedAuthorId ? (
                <Badge colorPalette="green" size="sm">
                  {t('author', { authorId: confirmedAuthorId })}
                </Badge>
              ) : null}
            </Flex>
            <Text textStyle="sm" color="fg.muted" mt="1">
              {t('description')}
            </Text>
          </Box>

          {hasCounts ? (
            <Box>
              <Text textStyle="xs" fontWeight="bold" color="fg.muted" mb="2">
                {t('metrics')}
              </Text>
              <Flex gap="4" flexWrap="wrap">
                <Metric
                  label={t('works')}
                  value={
                    counts.worksCount !== null
                      ? String(counts.worksCount)
                      : null
                  }
                />
                <Metric
                  label={t('citations')}
                  value={
                    counts.citedByCount !== null
                      ? String(counts.citedByCount)
                      : null
                  }
                />
                <Metric
                  label={t('hIndex')}
                  value={counts.hIndex !== null ? String(counts.hIndex) : null}
                />
                <Metric
                  label={t('i10Index')}
                  value={
                    counts.i10Index !== null ? String(counts.i10Index) : null
                  }
                />
              </Flex>
            </Box>
          ) : null}
        </Stack>
      </Box>

      {/*
       * The career card. The timeline is editable and sits at the top,
       * because it is the one thing the researcher corrects; the
       * spellings and the topics follow it as read-only reference.
       */}
      <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '5' }}>
        <Stack gap="4">
          <OnboardingAffiliationTimeline
            key={confirmedAuthorId ?? 'no-author'}
            affiliations={author.affiliations}
            values={affiliationValues}
            onChange={onAffiliationChange}
          />

          {author.nameVariants.length > 0 ? (
            <Box>
              <Text textStyle="xs" fontWeight="bold" color="fg.muted" mb="2">
                {t('nameVariants')}
              </Text>
              <Flex gap="2" flexWrap="wrap">
                {author.nameVariants.map((variant) => (
                  <Badge key={variant} colorPalette="purple" variant="surface">
                    {variant}
                  </Badge>
                ))}
              </Flex>
            </Box>
          ) : null}

          {author.topics.length > 0 ? (
            <Box>
              <Text textStyle="xs" fontWeight="bold" color="fg.muted" mb="2">
                {t('topics')}
              </Text>
              <Flex gap="2" flexWrap="wrap">
                {author.topics.slice(0, 8).map((topic) => (
                  <Badge key={topic.id} colorPalette="blue" variant="surface">
                    {topic.count !== null
                      ? `${topic.name} (${topic.count})`
                      : topic.name}
                  </Badge>
                ))}
              </Flex>
            </Box>
          ) : null}
        </Stack>
      </Box>
    </Stack>
  );
}

/**
 * One metric of the confirmed author.
 *
 * A metric OpenAlex reports as null is left out rather than shown as a
 * zero: "no h-index" and "an h-index of zero" are different facts, and
 * the second is a claim the platform cannot make.
 */
function Metric({ label, value }: { label: string; value: string | null }) {
  if (value === null) {
    return null;
  }
  return (
    <Box>
      <Text textStyle="md" fontWeight="bold" lineHeight="1.2">
        {value}
      </Text>
      <Text textStyle="xs" color="fg.muted">
        {label}
      </Text>
    </Box>
  );
}
