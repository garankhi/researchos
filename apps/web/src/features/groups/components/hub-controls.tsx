'use client';

import { useState, type ReactNode } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Box, Button, Heading, Stack } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import {
  FormSelect,
  FormSubmitButton,
  FormTextarea,
  FormTextField,
} from '@/components/ui/form';
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
} from '@/components/ui/feedback';
import { apiErrorCode, apiFieldErrorCodes } from '@/lib/api-error';
import { resolveErrorCode } from '@/utils/error-messages';
import { useHubMutation } from '../hooks/use-group-hub';

export type HubField = {
  name: string;
  label: string;
  initial?: string;
  required?: boolean;
  type?: 'textarea' | 'uuid' | 'number' | 'datetime-local';
  max?: number;
  options?: { value: string; label: string }[];
};

export function HubForm({
  groupId,
  title,
  fields,
  submit,
  children,
  onSaved,
}: {
  groupId: string;
  title: string;
  fields: HubField[];
  submit: (values: Record<string, string>) => Promise<unknown>;
  children?: ReactNode;
  onSaved?: () => void;
}) {
  const t = useTranslations('groups');
  const errors = useTranslations('errors');
  const mutation = useHubMutation(groupId, submit);
  const schema = z.object(
    Object.fromEntries(
      fields.map((field) => {
        let value = z.string().trim();
        if (field.required) value = value.min(1, 'validation_failed');
        if (field.max) value = value.max(field.max, 'validation_failed');
        const checked = value.refine((input) => {
          if (!input) return true;
          if (field.type === 'uuid') return z.uuid().safeParse(input).success;
          if (field.type === 'number')
            return (
              Number.isInteger(Number(input)) &&
              Number(input) >= 1 &&
              Number(input) <= 2147483647
            );
          if (field.type === 'datetime-local')
            return !Number.isNaN(new Date(input).getTime());
          return true;
        }, 'validation_failed');
        return [field.name, checked];
      }),
    ),
  );
  const methods = useForm<Record<string, string>>({
    resolver: zodResolver(schema),
    defaultValues: Object.fromEntries(
      fields.map((field) => [field.name, field.initial ?? '']),
    ),
  });
  const onSubmit = methods.handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync(values);
      onSaved?.();
    } catch (error) {
      const codes = apiFieldErrorCodes(error);
      for (const [name, messages] of Object.entries(codes ?? {})) {
        if (fields.some((field) => field.name === name))
          methods.setError(name, { message: messages[0] });
      }
    }
  });
  return (
    <Box borderWidth="1px" borderRadius="lg" p="4">
      <Heading as="h3" size="sm" mb="4">
        {title}
      </Heading>
      <FormProvider {...methods}>
        <form onSubmit={onSubmit} noValidate>
          <Stack gap="4">
            {fields.map((field) =>
              field.options ? (
                <FormSelect
                  key={field.name}
                  name={field.name}
                  label={field.label}
                  required={field.required}
                  disabled={mutation.isPending}
                >
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </FormSelect>
              ) : field.type === 'textarea' ? (
                <FormTextarea
                  key={field.name}
                  name={field.name}
                  label={field.label}
                  required={field.required}
                  disabled={mutation.isPending}
                />
              ) : (
                <FormTextField
                  key={field.name}
                  name={field.name}
                  label={field.label}
                  required={field.required}
                  disabled={mutation.isPending}
                  type={
                    field.type === 'number' || field.type === 'datetime-local'
                      ? field.type
                      : 'text'
                  }
                />
              ),
            )}
            {children}
            {mutation.isError ? (
              <ErrorState
                title={t('saveError')}
                message={resolveErrorCode(
                  errors,
                  apiErrorCode(mutation.error),
                  errors('unknown'),
                )}
              />
            ) : null}
            <FormSubmitButton
              mutation={mutation}
              label={t('save')}
              alignSelf="start"
            />
          </Stack>
        </form>
      </FormProvider>
    </Box>
  );
}

export function HubAction({
  groupId,
  label,
  action,
  confirm = false,
  disabled = false,
}: {
  groupId: string;
  label: string;
  action: () => Promise<unknown>;
  confirm?: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations('groups');
  const errors = useTranslations('errors');
  const [confirming, setConfirming] = useState(false);
  const mutation = useHubMutation(groupId, action);
  return (
    <Stack gap="2" align="start">
      {confirming ? (
        <Stack direction="row">
          <Button
            size="sm"
            colorPalette="red"
            loading={mutation.isPending}
            onClick={() =>
              mutation.mutate(undefined, {
                onSuccess: () => setConfirming(false),
              })
            }
          >
            {t('confirmAction', { action: label })}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={mutation.isPending}
            onClick={() => setConfirming(false)}
          >
            {t('cancel')}
          </Button>
        </Stack>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          loading={mutation.isPending}
          onClick={() =>
            confirm ? setConfirming(true) : mutation.mutate(undefined)
          }
        >
          {label}
        </Button>
      )}
      {mutation.isError ? (
        <ErrorState
          title={t('saveError')}
          message={resolveErrorCode(
            errors,
            apiErrorCode(mutation.error),
            errors('unknown'),
          )}
        />
      ) : null}
    </Stack>
  );
}

export function HubList<T>({
  query,
  children,
}: {
  query: {
    data?: T[];
    isPending: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => unknown;
    hasNextPage?: boolean;
    isFetchingNextPage?: boolean;
    fetchNextPage?: () => unknown;
  };
  children: (items: T[]) => ReactNode;
}) {
  const t = useTranslations('groups');
  const errors = useTranslations('errors');
  if (query.isPending)
    return <LoadingSkeleton variant="rectangular" height={130} count={2} />;
  if (query.isError)
    return (
      <ErrorState
        title={t('loadError')}
        message={resolveErrorCode(
          errors,
          apiErrorCode(query.error),
          errors('unknown'),
        )}
        onRetry={() => void query.refetch()}
      />
    );
  return (
    <Stack gap="4">
      {!query.data?.length ? (
        <EmptyState title={t('empty')} />
      ) : (
        children(query.data)
      )}
      {query.hasNextPage ? (
        <Button
          variant="outline"
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage?.()}
        >
          {t('loadMore')}
        </Button>
      ) : null}
    </Stack>
  );
}

export function HubSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Box
      as="section"
      bg="bg.panel"
      borderWidth="1px"
      borderRadius="lg"
      p={{ base: '4', md: '6' }}
    >
      <Heading as="h2" size="lg" mb="5">
        {title}
      </Heading>
      <Stack gap="4">{children}</Stack>
    </Box>
  );
}

export function HubEditor(
  props: Parameters<typeof HubForm>[0] & { label: string },
) {
  const [open, setOpen] = useState(false);
  const t = useTranslations('groups');
  return (
    <Stack gap="3">
      <Button
        variant="outline"
        alignSelf="start"
        onClick={() => setOpen(!open)}
      >
        {open ? t('cancel') : props.label}
      </Button>
      {open ? (
        <HubForm
          {...props}
          onSaved={() => {
            setOpen(false);
            props.onSaved?.();
          }}
        />
      ) : null}
    </Stack>
  );
}
