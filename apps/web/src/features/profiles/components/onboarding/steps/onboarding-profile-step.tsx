'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Box, Button, Flex, Heading, Stack, Text } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { FormSelect, FormTextarea, FormTextField } from '@/components/ui/form';
import { ErrorState } from '@/components/ui/feedback';
import {
  onboardingProfileSchema,
  type OnboardingProfileValues,
} from '../../../schemas/onboarding-profile.schema';
import { availabilityStatusValues } from '../../../schemas/profile-form.schema';
import type { ProfileResponseDto } from '../../../types';

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
  /** The OpenAlex author id the researcher confirmed, if any. */
  confirmedAuthorId: string | null;
  /** Whether the profile write is in flight. */
  isSaving: boolean;
  /** Writes the profile. */
  onSave: (values: OnboardingProfileValues) => Promise<void>;
  /** Leaves the step without writing anything. */
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
 * - **The OpenAlex author was confirmed.** The name, the department and
 *   the ORCID are prefilled from what OpenAlex holds, so the researcher
 *   checks them rather than types them.
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
  confirmedAuthorId,
  isSaving,
  onSave,
  onSkip,
}: OnboardingProfileStepProps) {
  const t = useTranslations('onboarding');
  const tAvailability = useTranslations('profile.availability');

  const [submitError, setSubmitError] = useState<string | null>(null);

  const defaults: OnboardingProfileValues = {
    fullName: profile?.fullName ?? '',
    departmentUnit: profile?.departmentUnit ?? '',
    academicTitle: profile?.academicTitle ?? '',
    academicDegree: profile?.academicDegree ?? '',
    orcidId: bareOrcid(
      prefillFromOpenAlex ? openAlexOrcid : profile?.orcidId,
    ),
    bio: profile?.bio ?? '',
    availabilityStatus: profile?.availabilityStatus ?? 'NOT_AVAILABLE',
    googleScholarUrl: profile?.googleScholarUrl ?? '',
    scopusAuthorId: profile?.scopusAuthorId ?? '',
  };

  const { control, handleSubmit } = useForm<OnboardingProfileValues>({
    resolver: zodResolver(onboardingProfileSchema),
    defaultValues: defaults,
  });

  const submit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      await onSave(values);
    } catch {
      setSubmitError(t('profileStep.failed'));
    }
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

      {prefillFromOpenAlex ? (
        <Box
          bg="bg.panel"
          boxShadow="xs"
          p={{ base: '4', md: '5' }}
          borderLeftWidth="3px"
          borderLeftColor="border.emphasized"
        >
          <Text textStyle="sm" fontWeight="bold">
            {t('profileStep.prefillTitle')}
          </Text>
          <Text textStyle="sm" color="fg.muted" mt="1">
            {confirmedAuthorId
              ? t('profileStep.prefillAuthor', { authorId: confirmedAuthorId })
              : t('profileStep.prefillAuthorUnknown')}
          </Text>
        </Box>
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
              <Button type="submit" loading={isSaving}>
                {t('profileStep.save')}
              </Button>
            </Flex>
          </Stack>
        </form>
      </Box>
    </Stack>
  );
}
