'use client';

import { useEffect, useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Dialog, Portal, Stack } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import {
  FormSelect,
  FormSubmitButton,
  FormTextarea,
  FormTextField,
} from '@/components/ui/form';
import { ErrorState } from '@/components/ui/feedback';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import {
  availabilityStatusValues,
  profileFormSchema,
  type ProfileFormValues,
} from '../schemas/profile-form.schema';
import { useUpdateProfile } from '../hooks/use-update-profile';
import type { ProfileResponseDto } from '../types';

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

  const methods = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      fullName: profile.fullName ?? '',
      departmentUnit: profile.departmentUnit ?? '',
      academicTitle: profile.academicTitle ?? '',
      academicDegree: profile.academicDegree ?? '',
      bio: profile.bio ?? '',
      availabilityStatus:
        profile.availabilityStatus ?? 'OPEN_FOR_COLLABORATION',
      googleScholarUrl: profile.googleScholarUrl ?? '',
      scopusAuthorId: profile.scopusAuthorId ?? '',
    },
  });

  const { handleSubmit, reset } = methods;

  useEffect(() => {
    if (open) {
      reset({
        fullName: profile.fullName ?? '',
        departmentUnit: profile.departmentUnit ?? '',
        academicTitle: profile.academicTitle ?? '',
        academicDegree: profile.academicDegree ?? '',
        bio: profile.bio ?? '',
        availabilityStatus:
          profile.availabilityStatus ?? 'OPEN_FOR_COLLABORATION',
        googleScholarUrl: profile.googleScholarUrl ?? '',
        scopusAuthorId: profile.scopusAuthorId ?? '',
      });
    }
  }, [open, profile, reset]);

  const onSubmit = async (data: ProfileFormValues) => {
    setSubmitError(null);
    try {
      await updateProfile.mutateAsync({
        data: {
          fullName: data.fullName,
          departmentUnit: data.departmentUnit,
          academicTitle: data.academicTitle || undefined,
          academicDegree: data.academicDegree || undefined,
          bio: data.bio || undefined,
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
    <Dialog.Root
      open={open}
      onOpenChange={(details) => {
        if (!details.open) onClose();
      }}
      size="lg"
      placement="center"
      motionPreset="scale"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header
              flexDirection="column"
              alignItems="flex-start"
              gap="1"
            >
              <Dialog.Title>{t('editProfileDialogTitle')}</Dialog.Title>
              <Dialog.Description textStyle="sm" color="fg.muted">
                {t('editProfileDialogDesc')}
              </Dialog.Description>
            </Dialog.Header>

            <FormProvider {...methods}>
              <form onSubmit={handleSubmit(onSubmit)} noValidate>
                <Dialog.Body>
                  <Stack gap="4">
                    {submitError ? (
                      <ErrorState
                        title={t('updateError')}
                        message={submitError}
                      />
                    ) : null}

                    <FormTextField
                      name="fullName"
                      label={t('fullName')}
                      required
                    />

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

                    <FormSelect
                      name="availabilityStatus"
                      label={t('availabilityStatus')}
                    >
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

                    <FormTextarea
                      name="bio"
                      label={t('bio')}
                      rows={4}
                      control={methods.control}
                    />
                  </Stack>
                </Dialog.Body>

                <Dialog.Footer>
                  <Button
                    variant="outline"
                    onClick={onClose}
                    disabled={updateProfile.isPending}
                  >
                    {tCommon('cancel')}
                  </Button>
                  <FormSubmitButton
                    mutation={updateProfile}
                    label={tCommon('save')}
                  />
                </Dialog.Footer>
              </form>
            </FormProvider>

            <Dialog.CloseTrigger />
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
