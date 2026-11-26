'use client';

import { useRef, useState } from 'react';
import { Button } from '@chakra-ui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { domainErrorCodes } from '@researchos/error-codes';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import { ErrorState } from '@/components/ui/feedback';
import { FormTextarea, FormTextField } from '@/components/ui/form';
import { FormModal } from '@/components/ui/form-modal';
import { useRouter } from '@/i18n/navigation';
import {
  getGroupsControllerFindAllQueryKey,
  useGroupsControllerCreate,
} from '@/lib/api';
import { apiErrorCode, apiStatusCode } from '@/lib/api-error';
import { resolveErrorCode } from '@/utils/error-messages';

const createGroupSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'group_code_required')
    .max(50, 'group_code_too_long'),
  name: z
    .string()
    .trim()
    .min(1, 'group_name_required')
    .max(255, 'group_name_too_long'),
  description: z.string().trim(),
});

type CreateGroupValues = z.infer<typeof createGroupSchema>;

export function CreateGroupButton() {
  const t = useTranslations('groups');
  const validation = useTranslations('groups.createGroupValidation');
  const errors = useTranslations('errors');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showSnackbar } = useSnackbar();
  const createGroup = useGroupsControllerCreate();
  const [open, setOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submitting = useRef(false);
  const resolveFieldError = (code: string) =>
    validation.has(code) ? validation(code) : undefined;

  async function submit({ code, name, description }: CreateGroupValues) {
    if (submitting.current) return;
    submitting.current = true;
    setSubmitError(null);
    try {
      const group = await createGroup.mutateAsync({
        data: { code, name, description: description || undefined },
      });
      void queryClient.invalidateQueries({
        queryKey: getGroupsControllerFindAllQueryKey(),
      });
      setOpen(false);
      showSnackbar({ message: t('groupCreated'), severity: 'success' });
      router.push(`/groups/${group.id}`);
    } finally {
      submitting.current = false;
    }
  }

  return (
    <FormModal<CreateGroupValues>
      open={open}
      onClose={() => setOpen(false)}
      title={t('newGroup')}
      description={t('createGroupDescription')}
      submitLabel={t('createGroup')}
      resolver={zodResolver(createGroupSchema)}
      defaultValues={{ code: '', name: '', description: '' }}
      onSubmit={submit}
      onSubmitError={(error, setFieldError) => {
        const code = apiErrorCode(error);
        if (
          apiStatusCode(error) === 409 &&
          code === domainErrorCodes.groups.groupCodeAlreadyExists
        ) {
          setFieldError('code', code);
          return;
        }
        setSubmitError(resolveErrorCode(errors, code, errors('unknown')));
      }}
      isSubmitting={createGroup.isPending}
      trigger={
        <Button
          size="sm"
          onClick={() => {
            setSubmitError(null);
            setOpen(true);
          }}
        >
          {t('newGroup')}
        </Button>
      }
    >
      <FormTextField
        name="code"
        label={t('code')}
        resolveFieldError={resolveFieldError}
        disabled={createGroup.isPending}
        required
      />
      <FormTextField
        name="name"
        label={t('name')}
        resolveFieldError={resolveFieldError}
        disabled={createGroup.isPending}
        required
      />
      <FormTextarea
        name="description"
        label={t('description')}
        disabled={createGroup.isPending}
        rows={4}
      />
      {submitError ? (
        <ErrorState title={t('createGroupError')} message={submitError} />
      ) : null}
    </FormModal>
  );
}
