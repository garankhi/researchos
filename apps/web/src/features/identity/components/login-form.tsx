'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { Alert, Box, Stack } from '@mui/material';
import { FormSubmitButton, FormTextField } from '@/components/ui/form';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import { apiErrorCode, apiFieldErrorCodes } from '@/lib/api-error';
import { resolveErrorCode } from '@/utils/error-messages';
import { useLogin } from '../hooks/use-login';
import { loginFormSchema } from '../schemas/login-form.schema';
import type { LoginFormValues } from '../schemas/login-form.schema';

/**
 * The local login form.
 *
 * It is the whole form convention in one component: a zod schema whose
 * messages are error **codes**, react-hook-form for the state, the shared
 * MUI form primitives for the controls, and the message catalog for every
 * label and error.
 *
 * ## Where the failures go
 *
 * - A schema failure is shown under the input that caused it — the
 *   primitives resolve the code through the catalog.
 * - A `400` from the server carries the failing fields, so the codes are
 *   mapped back onto the inputs with `setError`.
 * - Anything else (a rejected credential, an inactive account, a network
 *   failure) has no field to attach to, so it is shown as one inline alert
 *   above the form. The code is resolved through the catalog, so the user
 *   reads their own language and never a raw `invalid_credentials`.
 *
 * The submit button is bound to the **mutation's** `isPending` through
 * `FormSubmitButton`, so the spinner tracks the request rather than the
 * client-side validation.
 */
export function LoginForm() {
  const t = useTranslations('identity');
  const tError = useTranslations('errors');
  const { showSnackbar } = useSnackbar();

  const [serverMessage, setServerMessage] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
  });

  const mutation = useLogin();

  const onSubmit = handleSubmit(async (values) => {
    setServerMessage(null);

    try {
      const account = await mutation.mutateAsync(values);

      showSnackbar({ severity: 'success', message: t('signedIn') });

      // The account may still have to change its password. That is not a
      // failure, but it is something the user has to know, so it is stated
      // rather than silently swallowed.
      if (account?.mustChangePassword) {
        showSnackbar({
          severity: 'warning',
          message: tError('codes.domain.must_change_password'),
          autoHideDuration: null,
        });
      }
    } catch (error) {
      const codes = apiFieldErrorCodes(error);

      if (codes) {
        // The server rejected specific fields. Each code goes back onto the
        // input that caused it, and the primitive resolves it through the
        // catalog.
        for (const [field, messages] of Object.entries(codes)) {
          setError(field as keyof LoginFormValues, {
            type: 'server',
            message: messages[0],
          });
        }

        return;
      }

      // No field to blame — the whole request failed. The code is a domain
      // code (`invalid_credentials`, `account_inactive`) or a generic one,
      // and `resolveErrorCode` looks in every tier.
      setServerMessage(
        resolveErrorCode(
          tError,
          apiErrorCode(error),
          tError('unknown'),
          'domain',
        ),
      );
    }
  });

  return (
    <Box component="form" onSubmit={onSubmit} noValidate>
      <Stack spacing={2}>
        {serverMessage ? (
          <Alert severity="error" role="alert">
            {serverMessage}
          </Alert>
        ) : null}

        <FormTextField
          name="email"
          label={t('email')}
          type="email"
          autoComplete="email"
          control={control}
          error={Boolean(errors.email)}
        />

        <FormTextField
          name="password"
          label={t('password')}
          type="password"
          autoComplete="current-password"
          control={control}
          error={Boolean(errors.password)}
        />

        <FormSubmitButton mutation={mutation} label={t('submit')} fullWidth />
      </Stack>
    </Box>
  );
}
