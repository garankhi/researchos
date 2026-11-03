'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useMutation } from '@tanstack/react-query';
import { Alert, Box, Button, MenuItem, Stack } from '@mui/material';
import { z } from 'zod';
import {
  FormCheckbox,
  FormSelect,
  FormSubmitButton,
  FormTextField,
} from '@/components/ui/form';
import { DemoNote, DemoRow, DemoSection } from './demo-ui';

/**
 * The form conventions, exercised end to end.
 *
 * This section is the reference implementation of the `researchos-forms`
 * skill: a zod schema whose messages are error codes, react-hook-form for
 * the state, the shared MUI form primitives for the controls, and the
 * message catalog for every label and error.
 *
 * The submit button uses `FormSubmitButton`, which is bound to the
 * **mutation's** `isPending` — not the form's `isSubmitting`. The form
 * validates locally and then fires a mutation, and the two are separate
 * windows: the spinner must track the request, not the validation.
 *
 * It is deliberately local — it does not call the API — so the validation
 * behaviour can be observed without a backend running. The mutation
 * simulates a request so the pending state is observable too.
 */

const formSchema = z.object({
  title: z.string().min(1, 'title_required'),
  email: z.string().email('email_invalid'),
  status: z.enum(['draft', 'active'], { error: 'status_invalid' }),
  subscribe: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

/**
 * A stand-in for a real request, so the pending state is observable
 * without a backend running.
 */
function submitDemoForm(values: FormValues): Promise<FormValues> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(values), 1200);
  });
}

export function FormSection() {
  const t = useTranslations('demo');
  const tError = useTranslations('errors');

  const {
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      email: '',
      status: 'draft',
      subscribe: false,
    },
  });

  const mutation = useMutation({ mutationFn: submitDemoForm });

  const onSubmit = handleSubmit((values) => {
    // A real form would call the mutation here. The demo shows the
    // validation behaviour, which is the part that is easy to get wrong.
    mutation.mutate(values);
  });

  return (
    <DemoSection
      id="forms"
      title={t('sections.forms.title')}
      description={t('sections.forms.description')}
    >
      <Box component="form" onSubmit={onSubmit} noValidate>
        <Stack spacing={2}>
          <FormTextField
            name="title"
            label={t('forms.titleLabel')}
            control={control}
            error={Boolean(errors.title)}
          />

          <FormTextField
            name="email"
            label={t('forms.emailLabel')}
            type="email"
            control={control}
            error={Boolean(errors.email)}
          />

          <FormSelect
            name="status"
            label={t('forms.statusLabel')}
            control={control}
            error={Boolean(errors.status)}
          >
            <MenuItem value="draft">{t('forms.statusDraft')}</MenuItem>
            <MenuItem value="active">{t('forms.statusActive')}</MenuItem>
          </FormSelect>

          <FormCheckbox
            name="subscribe"
            label={t('forms.subscribeLabel')}
            control={control}
          />

          <Alert severity="info">{t('forms.hint')}</Alert>

          <DemoRow label={t('forms.actions')}>
            <FormSubmitButton mutation={mutation} label={t('forms.submit')} />
            <Button type="button" variant="outlined" disabled={!isDirty}>
              {t('forms.reset')}
            </Button>
          </DemoRow>

          <DemoNote>{t('forms.note', { unknown: tError('unknown') })}</DemoNote>
        </Stack>
      </Box>
    </DemoSection>
  );
}
