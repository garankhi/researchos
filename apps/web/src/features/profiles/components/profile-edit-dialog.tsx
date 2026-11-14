'use client';

import { useEffect } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
} from '@mui/material';
import { useTranslations } from 'next-intl';
import {
  FormSelect,
  FormSubmitButton,
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
      showSnackbar({ message: t('updateSuccess'), severity: 'success' });
      onClose();
    } catch {
      // Error handled by mutation state and displayed in dialog
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('editProfile')}</DialogTitle>
      <FormProvider {...methods}>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogContent dividers>
            <Stack spacing={2.5}>
              {updateProfile.isError ? (
                <ErrorState
                  title={t('updateError')}
                  message={
                    (
                      updateProfile.error as {
                        response?: { data?: { message?: string } };
                      }
                    )?.response?.data?.message || t('updateError')
                  }
                />
              ) : null}

              <FormTextField
                name="fullName"
                label={t('fields.fullName')}
                required
                fullWidth
              />

              <FormTextField
                name="departmentUnit"
                label={t('fields.departmentUnit')}
                required
                fullWidth
              />

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <FormTextField
                  name="academicTitle"
                  label={t('fields.academicTitle')}
                  fullWidth
                />
                <FormTextField
                  name="academicDegree"
                  label={t('fields.academicDegree')}
                  fullWidth
                />
              </Stack>

              <FormSelect
                name="availabilityStatus"
                label={t('fields.availabilityStatus')}
                fullWidth
              >
                {availabilityStatusValues.map((status) => (
                  <MenuItem key={status} value={status}>
                    {tAvailability(status)}
                  </MenuItem>
                ))}
              </FormSelect>

              <FormTextField
                name="googleScholarUrl"
                label={t('fields.googleScholarUrl')}
                fullWidth
                placeholder="https://scholar.google.com/citations?user=..."
              />

              <FormTextField
                name="scopusAuthorId"
                label={t('fields.scopusAuthorId')}
                fullWidth
                placeholder="57200000000"
              />

              <FormTextField
                name="bio"
                label={t('fields.bio')}
                multiline
                rows={4}
                fullWidth
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button
              onClick={onClose}
              color="inherit"
              disabled={updateProfile.isPending}
            >
              {tCommon('cancel')}
            </Button>
            <FormSubmitButton
              mutation={updateProfile}
              label={tCommon('save')}
              variant="contained"
            />
          </DialogActions>
        </form>
      </FormProvider>
    </Dialog>
  );
}
