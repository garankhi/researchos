'use client';

import { Button, CloseButton, Dialog, Portal, Stack } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { useEffect, type ReactNode } from 'react';
import {
  FormProvider,
  useForm,
  type DefaultValues,
  type FieldValues,
  type Resolver,
} from 'react-hook-form';

/**
 * The dialog a form opens in.
 *
 * The modal owns the layout and the form lifecycle. The feature module
 * owns the data: it passes the resolver, the default values, and the
 * submit handler, and renders the fields as children. The fields bind to
 * the form through the `FormProvider` this component provides, so a
 * feature never wires a control by hand.
 *
 * The `<form>` element wraps the body and the footer, so the submit
 * button sits in the footer next to the cancel button and still submits
 * the form that owns the fields. The dialog closes from the top-right
 * rather than from the cancel button.
 */
export function FormModal<
  TValues extends FieldValues = FieldValues,
  TContext = unknown,
>({
  open,
  onClose,
  title,
  description,
  children,
  submitLabel,
  resolver,
  defaultValues,
  onSubmit,
  onSubmitError,
  isSubmitting = false,
  isSubmitDisabled = false,
  cancelLabel,
  size = 'lg',
  trigger,
  resetKey,
}: {
  /** Whether the dialog is open. */
  open: boolean;
  /** Called when the dialog asks to close. */
  onClose: () => void;
  title: ReactNode;
  /** Rendered under the title. */
  description?: ReactNode;
  /** The fields. They bind to the form this component provides. */
  children: ReactNode;
  /** The submit button's label. */
  submitLabel: ReactNode;
  /** The form's validation resolver. */
  resolver?: Resolver<TValues, TContext>;
  /** The form's initial values. */
  defaultValues?: DefaultValues<TValues>;
  /** Runs with the validated values. */
  onSubmit: (values: TValues) => void | Promise<void>;
  /**
   * Runs when the submission fails.
   *
   * The failure is the caller's to render: a server error that names
   * fields belongs on those fields, and anything else belongs in an
   * inline alert next to the form.
   */
  onSubmitError?: (error: unknown) => void;
  /** Whether the submit button shows its spinner. */
  isSubmitting?: boolean;
  /** Whether the submit button is disabled. */
  isSubmitDisabled?: boolean;
  /** The cancel button's label. Defaults to the catalog's `common.cancel`. */
  cancelLabel?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /**
   * The control that opens the dialog. The dialog still opens and closes
   * through `open` and `onClose`, so the trigger is a convenience rather
   * than a second source of truth.
   */
  trigger?: ReactNode;
  /**
   * When this changes, the form is reset to the current `defaultValues`.
   * Pass the id of the entity being edited, so the form picks up the
   * fresh values each time the dialog opens on a different record.
   */
  resetKey?: string;
}) {
  const t = useTranslations('common');
  const methods = useForm<TValues, TContext>({
    resolver,
    defaultValues,
  });

  // The form picks up the fresh values whenever the dialog opens on a
  // different record.
  useEffect(() => {
    methods.reset(defaultValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const handleSubmit = methods.handleSubmit(async (values) => {
    try {
      await onSubmit(values as TValues);
    } catch (error) {
      onSubmitError?.(error);
    }
  });

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(details) => {
        if (!details.open && !isSubmitting) onClose();
      }}
      placement="center"
      size={size}
      scrollBehavior="inside"
      lazyMount
      unmountOnExit
    >
      {trigger ? <Dialog.Trigger asChild>{trigger}</Dialog.Trigger> : null}
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content
            borderRadius="0"
            shadow="overlayPanel"
            mx="4"
            maxW="lg"
            w="full"
          >
            <Dialog.Header>
              <Dialog.Title>{title}</Dialog.Title>
              {description ? (
                <Dialog.Description textStyle="sm" color="fg.muted">
                  {description}
                </Dialog.Description>
              ) : null}
            </Dialog.Header>

            <FormProvider {...methods}>
              <form onSubmit={handleSubmit} noValidate>
                <Dialog.Body>
                  <Stack gap="4">{children}</Stack>
                </Dialog.Body>
                <Dialog.Footer>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onClose}
                    disabled={isSubmitting}
                  >
                    {cancelLabel ?? t('cancel')}
                  </Button>
                  <Button
                    type="submit"
                    loading={isSubmitting}
                    disabled={isSubmitDisabled}
                  >
                    {submitLabel}
                  </Button>
                </Dialog.Footer>
              </form>
            </FormProvider>

            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" aria-label={t('close')} />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
