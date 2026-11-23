'use client';

import { GroupListSkeleton } from './group-skeletons';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Box,
  Button,
  Flex,
  Heading,
  IconButton,
  Menu,
  Portal,
  Stack,
  Text,
} from '@chakra-ui/react';
import { Ellipsis } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FormSelect, FormTextarea, FormTextField } from '@/components/ui/form';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { FormModal } from '@/components/ui/form-modal';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
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

const MenuContext = createContext<{
  close: () => void;
  container: HTMLDivElement | null;
} | null>(null);

/**
 * The per-row action menu.
 *
 * `positioned` keeps the trigger pinned to the top-right of a card, the
 * way the old hub layout placed it. The default places the trigger inline
 * so it can sit in a heading row next to a title.
 */
export function HubMenu({
  children,
  positioned = false,
}: {
  children: ReactNode;
  positioned?: boolean;
}) {
  const t = useTranslations('groups');
  const [open, setOpen] = useState(false);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  return (
    <Box
      position={positioned ? 'absolute' : 'relative'}
      top={positioned ? '3' : undefined}
      right={positioned ? '3' : undefined}
      flexShrink={0}
    >
      <Menu.Root
        open={open}
        onOpenChange={(details) => setOpen(details.open)}
        positioning={{ placement: 'bottom-end' }}
        closeOnSelect={false}
      >
        <Menu.Trigger asChild>
          <IconButton size="sm" variant="ghost" aria-label={t('actions')}>
            <Ellipsis />
          </IconButton>
        </Menu.Trigger>
        <Portal>
          <Menu.Positioner>
            <Menu.Content
              ref={setContainer}
              shadow="overlayPanel"
              borderRadius="0"
            />
          </Menu.Positioner>
        </Portal>
        {/* Keep dialogs mounted outside the menu content when selection closes it. */}
        <MenuContext.Provider
          value={{ close: () => setOpen(false), container }}
        >
          {children}
        </MenuContext.Provider>
      </Menu.Root>
    </Box>
  );
}

function HubTrigger({
  label,
  onClick,
  disabled = false,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  const menu = useContext(MenuContext);
  if (menu)
    return menu.container
      ? createPortal(
          <Menu.Item
            value={label}
            disabled={disabled}
            color={danger ? 'fg.error' : undefined}
            layerStyle="interactiveRow"
            onSelect={() => {
              menu.close();
              onClick();
            }}
          >
            {label}
          </Menu.Item>,
          menu.container,
        )
      : null;
  return (
    <Button
      size="sm"
      variant="outline"
      alignSelf="start"
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

/**
 * The schema for a set of hub fields.
 *
 * Each field carries its own constraints, so the schema is built from the
 * field list rather than written out by hand.
 */
function hubFieldSchema(fields: HubField[]) {
  return z.object(
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
}

/**
 * The fields of a hub form.
 *
 * The fields bind to the form the surrounding `FormModal` provides, so a
 * field never names a control of its own. The extra content a feature
 * adds — a search field, a topic picker — goes after the fields.
 */
export function HubFields({
  fields,
  disabled,
  children,
}: {
  fields: HubField[];
  disabled?: boolean;
  children?: ReactNode;
}) {
  const { control } = useFormContext<Record<string, string>>();

  return (
    <Stack gap="4">
      {fields.map((field) =>
        field.options ? (
          <FormSelect
            key={field.name}
            name={field.name}
            label={field.label}
            required={field.required}
            disabled={disabled}
            control={control}
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
            disabled={disabled}
            control={control}
          />
        ) : (
          <FormTextField
            key={field.name}
            name={field.name}
            label={field.label}
            required={field.required}
            disabled={disabled}
            control={control}
            type={
              field.type === 'number' || field.type === 'datetime-local'
                ? field.type
                : 'text'
            }
          />
        ),
      )}
      {children}
    </Stack>
  );
}

/**
 * The editor a group's rows open.
 *
 * The modal owns the layout and the form; the fields, the schema and the
 * mutation belong to the feature. The submit closes the modal and calls
 * `onSaved`.
 */
export function HubEditor({
  groupId,
  label,
  title,
  fields,
  submit,
  submitLabel,
  children,
  onSaved,
  resetKey,
}: {
  groupId: string;
  label: string;
  title: string;
  fields: HubField[];
  submit: (values: Record<string, string>) => Promise<unknown>;
  children?: ReactNode;
  submitLabel?: string;
  onSaved?: () => void;
  /**
   * When this changes, the form is reset to the current field values.
   *
   * A form whose fields arrive asynchronously needs it: the fields are
   * empty until the data lands, and the form has to pick them up.
   */
  resetKey?: string;
}) {
  const t = useTranslations('groups');
  const errors = useTranslations('errors');
  const mutation = useHubMutation(groupId, submit);
  const [open, setOpen] = useState(false);

  const schema = hubFieldSchema(fields);
  const defaultValues = Object.fromEntries(
    fields.map((field) => [field.name, field.initial ?? '']),
  );

  const onSubmit = async (values: Record<string, string>) => {
    await mutation.mutateAsync(values);
    setOpen(false);
    onSaved?.();
  };

  const onSubmitError = (
    error: unknown,
    setFieldError: (name: string, message: string) => void,
  ) => {
    // The server named the fields it rejected, so each message goes
    // back onto the field that caused it.
    const codes = apiFieldErrorCodes(error);
    for (const [name, messages] of Object.entries(codes ?? {})) {
      if (fields.some((field) => field.name === name) && messages[0])
        setFieldError(name, messages[0]);
    }
  };

  return (
    <>
      <HubTrigger label={label} onClick={() => setOpen(true)} />
      <FormModal<Record<string, string>>
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        submitLabel={submitLabel ?? t('save')}
        cancelLabel={t('cancel')}
        resolver={zodResolver(schema)}
        defaultValues={defaultValues}
        onSubmit={onSubmit}
        onSubmitError={onSubmitError}
        isSubmitting={mutation.isPending}
        resetKey={resetKey}
      >
        <HubFields fields={fields} disabled={mutation.isPending}>
          {children}
        </HubFields>
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
      </FormModal>
    </>
  );
}

export function HubAction({
  groupId,
  label,
  action,
  confirm = false,
  disabled = false,
  danger = false,
}: {
  groupId: string;
  label: string;
  action: () => Promise<unknown>;
  confirm?: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  const t = useTranslations('groups');
  const errors = useTranslations('errors');
  const [confirming, setConfirming] = useState(false);
  const mutation = useHubMutation(groupId, action);
  return (
    <>
      <HubTrigger
        label={label}
        disabled={disabled || mutation.isPending}
        danger={danger}
        onClick={() =>
          confirm ? setConfirming(true) : mutation.mutate(undefined)
        }
      />
      <ConfirmationModal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={label}
        body={
          <>
            <Text textStyle="sm" color="fg.muted">
              {t('confirmAction', { action: label })}
            </Text>
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
          </>
        }
        confirmLabel={t('confirmAction', { action: label })}
        cancelLabel={t('cancel')}
        colorPalette={danger ? 'red' : 'gray'}
        role="alertdialog"
        isConfirming={mutation.isPending}
        onConfirm={() =>
          mutation.mutate(undefined, { onSuccess: () => setConfirming(false) })
        }
      />
      {mutation.isError && !confirm ? (
        <ErrorState
          title={t('saveError')}
          message={resolveErrorCode(
            errors,
            apiErrorCode(mutation.error),
            errors('unknown'),
          )}
        />
      ) : null}
    </>
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
  if (query.isPending) return <GroupListSkeleton />;
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
        // The rows carry their own bottom border, so they stack tightly
        // and the rule reads as a separator rather than a gap.
        <Stack gap="4">{children(query.data)}</Stack>
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
  action,
  children,
}: {
  title: string;
  /** Rendered on the right of the section heading. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box as="section" bg="bg.panel" boxShadow="xs">
      <Flex
        px={{ base: '4', md: '6' }}
        py="4"
        borderBottomWidth="1px"
        borderColor="border"
        align="center"
        justify="space-between"
        gap="3"
        flexWrap="wrap"
      >
        <Heading as="h2" size="md" fontWeight="bold">
          {title}
        </Heading>
        {action}
      </Flex>
      <Box p={{ base: '4', md: '6' }}>
        <Stack gap="4">{children}</Stack>
      </Box>
    </Box>
  );
}
