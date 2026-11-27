'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  Stack,
  Text,
} from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { FormSelect, FormTextarea, FormTextField } from '@/components/ui/form';
import { ErrorState } from '@/components/ui/feedback';
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

/**
 * The props of the profile step.
 */
export interface OnboardingProfileStepProps {
  /** The researcher's current profile, read from the API. */
  profile: ProfileResponseDto | null;
  /** Whether the confirmed OpenAlex author carries an ORCID to prefill. */
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
  /** Records the values in the draft. */
  onSave: (values: OnboardingDraftProfileValues) => void;
  /** Leaves the step without recording anything. */
  onSkip: () => void;
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
  prefillFromOpenAlex,
  openAlexOrcid,
  openAlexAuthor,
  confirmedAuthorId,
  draftValues,
  onSave,
  onSkip,
}: OnboardingProfileStepProps) {
  const t = useTranslations('onboarding');
  const tAvailability = useTranslations('profile.availability');

  const [submitError, setSubmitError] = useState<string | null>(null);

  /*
   * The draft wins over the prefilled values: a researcher who typed
   * something and came back finds their own text, not the one OpenAlex
   * suggested.
   */
  const defaults: OnboardingProfileValues = {
    fullName:
      draftValues?.fullName ?? openAlexAuthor?.displayName ?? profile?.fullName ?? '',
    departmentUnit:
      draftValues?.departmentUnit ?? profile?.departmentUnit ?? '',
    academicTitle: draftValues?.academicTitle ?? profile?.academicTitle ?? '',
    academicDegree:
      draftValues?.academicDegree ?? profile?.academicDegree ?? '',
    orcidId:
      draftValues?.orcidId ??
      bareOrcid(
        prefillFromOpenAlex
          ? (openAlexOrcid ?? openAlexAuthor?.orcid)
          : profile?.orcidId,
      ),
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

  const { control, handleSubmit, reset } = useForm<OnboardingProfileValues>({
    resolver: zodResolver(onboardingProfileSchema),
    defaultValues: defaults,
  });

  /*
   * The form is re-seeded when the draft changes, so the values the
   * researcher typed in a previous visit to the step are what they see.
   */
  useEffect(() => {
    reset(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    draftValues,
    profile?.fullName,
    profile?.departmentUnit,
    profile?.orcidId,
    openAlexOrcid,
    openAlexAuthor?.displayName,
  ]);

  const submit = handleSubmit((values) => {
    setSubmitError(null);
    onSave(values as OnboardingDraftProfileValues);
  });

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
        />
      ) : null}

      {submitError ? (
        <ErrorState title={t('profileStep.failed')} message={submitError} />
      ) : null}

      <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '5' }}>
        <form onSubmit={submit} noValidate>
          <Stack gap="4">
            <FormTextField name="fullName" label={t('profileStep.fullName')} control={control} />

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

            <FormTextarea
              name="bio"
              label={t('profileStep.bio')}
              rows={4}
              control={control}
            />

            <Flex justify="flex-end" gap="3">
              <Button type="button" variant="outline" onClick={onSkip}>
                {t('profileStep.skip')}
              </Button>
              <Button type="submit">{t('profileStep.save')}</Button>
            </Flex>
          </Stack>
        </form>
      </Box>
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
 * ## What is editable
 *
 * Only the fields the platform stores are editable. The byline
 * spellings, the topics, the affiliations and the metrics are what
 * OpenAlex holds, and the platform does not own them: they are shown
 * for the researcher's reference, and the researcher corrects their own
 * fields rather than the source's.
 */
function OnAlexPrefillPanel({
  author,
  confirmedAuthorId,
}: {
  author: OnboardingDraftOpenAlexAuthor;
  confirmedAuthorId: string | null;
}) {
  const t = useTranslations('onboarding.profileStep.prefill');

  const counts = author.counts;
  const hasCounts =
    counts.citedByCount !== null ||
    counts.hIndex !== null ||
    counts.i10Index !== null ||
    counts.twoYearMeanCitedness !== null;

  return (
    <Box
      bg="bg.panel"
      boxShadow="xs"
      p={{ base: '4', md: '5' }}
      borderLeftWidth="3px"
      borderLeftColor="border.emphasized"
    >
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
                value={counts.i10Index !== null ? String(counts.i10Index) : null}
              />
            </Flex>
          </Box>
        ) : null}

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

        {author.affiliations.length > 0 ? (
          <Box>
            <Text textStyle="xs" fontWeight="bold" color="fg.muted" mb="2">
              {t('affiliations')}
            </Text>
            <Stack gap="1">
              {author.affiliations.map((affiliation) => (
                <Flex key={affiliation.institutionId} gap="2" align="baseline">
                  <Text textStyle="sm">{affiliation.name}</Text>
                  <Text textStyle="xs" color="fg.muted">
                    {affiliationYear(
                      affiliation.yearStart,
                      affiliation.yearEnd,
                    )}
                  </Text>
                </Flex>
              ))}
            </Stack>
          </Box>
        ) : null}
      </Stack>
    </Box>
  );
}

/**
 * One metric of the confirmed author.
 *
 * A metric OpenAlex reports as null is left out rather than shown as a
 * zero: "no h-index" and "an h-index of zero" are different facts, and
 * the second is a claim the platform cannot make.
 */
function Metric({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
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

/**
 * The years an affiliation held.
 *
 * A running affiliation has no end year yet, and OpenAlex reports the
 * range sparsely — the years in between are not spelled out — so the
 * range is the first and the last year.
 */
function affiliationYear(
  yearStart: number | null,
  yearEnd: number | null,
): string {
  if (yearStart !== null && yearEnd !== null) {
    return `${yearStart}–${yearEnd}`;
  }
  if (yearStart !== null) {
    return `${yearStart}–`;
  }
  if (yearEnd !== null) {
    return `–${yearEnd}`;
  }
  return '—';
}
