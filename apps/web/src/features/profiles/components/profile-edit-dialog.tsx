'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Stack } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { FormSelect, FormTextarea, FormTextField } from '@/components/ui/form';
import { FormModal } from '@/components/ui/form-modal';
import { ErrorState } from '@/components/ui/feedback';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import {
  availabilityStatusValues,
  profileFormSchema,
  type ProfileFormValues,
} from '../schemas/profile-form.schema';
import { useUpdateProfile } from '../hooks/use-update-profile';
import type { ProfileResponseDto } from '../types';

/**
 * The form's initial values, read from the profile.
 *
 * The dialog opens on one profile at a time, so the values are read once
 * when the form is created and again whenever the dialog is reset.
 */
function profileDefaults(profile: ProfileResponseDto): ProfileFormValues {
  return {
    fullName: profile.fullName ?? '',
    departmentUnit: profile.departmentUnit ?? '',
    academicTitle: profile.academicTitle ?? '',
    academicDegree: profile.academicDegree ?? '',
    bio: profile.bio ?? '',
    availabilityStatus: profile.availabilityStatus ?? 'OPEN_FOR_COLLABORATION',
    googleScholarUrl: profile.googleScholarUrl ?? '',
    scopusAuthorId: profile.scopusAuthorId ?? '',
  };
}

export function ProfileEditDialog({
  open,
  onClose,
  profile,
}: {
  open: boolean;
  onClose: () => void;
  profile: ProfileResponseDto;
}) {
  const t = useTranslations('profile');
  const tAvailability = useTranslations('profile.availability');
  const tCommon = useTranslations('common');
  const { showSnackbar } = useSnackbar();
  const updateProfile = useUpdateProfile();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const onSubmit = async (data: ProfileFormValues) => {
    setSubmitError(null);
    try {
      await updateProfile.mutateAsync({
        data: {
          fullName: data.fullName,
          departmentUnit: data.departmentUnit,
          academicTitle: data.academicTitle ?? '',
          academicDegree: data.academicDegree ?? '',
          bio: data.bio ?? '',
          availabilityStatus: data.availabilityStatus,
          googleScholarUrl: data.googleScholarUrl || undefined,
          scopusAuthorId: data.scopusAuthorId || undefined,
        },
      });
      showSnackbar({ message: t('profileUpdated'), severity: 'success' });
      onClose();
    } catch {
      // The failure is shown inline, next to the form that failed.
      setSubmitError(t('updateError'));
    }
  };

  return (
    <FormModal<ProfileFormValues>
      open={open}
      onClose={onClose}
      title={t('editProfileDialogTitle')}
      description={t('editProfileDialogDesc')}
      submitLabel={tCommon('save')}
      resolver={zodResolver(profileFormSchema)}
      defaultValues={profileDefaults(profile)}
      onSubmit={onSubmit}
      isSubmitting={updateProfile.isPending}
      resetKey={profile.userId}
    >
      {submitError ? (
        <ErrorState title={t('updateError')} message={submitError} />
      ) : null}

      <FormTextField name="fullName" label={t('fullName')} required />

      <FormTextField
        name="departmentUnit"
        label={t('departmentUnit')}
        required
      />

      <Stack direction={{ base: 'column', sm: 'row' }} gap="4">
        <FormTextField
          name="academicTitle"
          label={t('academicTitle')}
          wrapperProps={{ flex: '1', minW: '0' }}
        />
        <FormTextField
          name="academicDegree"
          label={t('academicDegree')}
          wrapperProps={{ flex: '1', minW: '0' }}
        />
      </Stack>

      <FormSelect name="availabilityStatus" label={t('availabilityStatus')}>
        {availabilityStatusValues.map((status) => (
          <option key={status} value={status}>
            {tAvailability(status)}
          </option>
        ))}
      </FormSelect>

      <FormTextField
        name="googleScholarUrl"
        label={t('googleScholarUrl')}
        placeholder="https://scholar.google.com/citations?user=..."
      />

      <FormTextField
        name="scopusAuthorId"
        label={t('scopusAuthorId')}
        placeholder="57200000000"
      />

      <FormTextarea name="bio" label={t('bio')} rows={4} />
    </FormModal>
  );
}
