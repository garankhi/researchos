'use client';

import {
  Button,
  CloseButton,
  Dialog,
  Portal,
  Stack,
  Text,
} from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

/**
 * The dialog that confirms an action.
 *
 * It is the sibling of `FormModal` and shares its layout: the same
 * content box, the same footer, the same close trigger in the top-right.
 * What it does not have is a form — there is nothing to type and nothing
 * to validate.
 *
 * The confirm button carries the `red` palette by default, because the
 * actions this dialog guards — deleting, withdrawing, removing — are
 * destructive. A confirmation that is not destructive picks another
 * palette.
 */
export function ConfirmationModal({
  open,
  onClose,
  title,
  description,
  body,
  confirmLabel,
  onConfirm,
  isConfirming = false,
  isConfirmDisabled = false,
  cancelLabel,
  colorPalette = 'red',
  size = 'md',
  role = 'dialog',
}: {
  /** Whether the dialog is open. */
  open: boolean;
  /** Called when the dialog asks to close. */
  onClose: () => void;
  title: ReactNode;
  /** A line under the title. */
  description?: ReactNode;
  /**
   * The dialog's content.
   *
   * A plain `description` is enough for a question the dialog asks. When
   * the answer is a set of choices, the choices go here instead.
   */
  body?: ReactNode;
  /** The confirm button's label. */
  confirmLabel: ReactNode;
  /** Runs the confirmed action. */
  onConfirm: () => void | Promise<void>;
  /** Whether the confirm button shows its spinner. */
  isConfirming?: boolean;
  /** Whether the confirm button is disabled. */
  isConfirmDisabled?: boolean;
  /** The cancel button's label. Defaults to the catalog's `common.cancel`. */
  cancelLabel?: ReactNode;
  /** The confirm button's palette. Defaults to `red`. */
  colorPalette?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /**
   * The dialog's ARIA role.
   *
   * `alertdialog` is the right role for a confirmation that guards a
   * destructive action: it tells assistive technology the dialog needs
   * attention before the reader carries on.
   */
  role?: 'dialog' | 'alertdialog';
}) {
  const t = useTranslations('common');

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(details) => {
        if (!details.open && !isConfirming) onClose();
      }}
      placement="center"
      size={size}
      role={role}
      scrollBehavior="inside"
      lazyMount
      unmountOnExit
    >
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
            </Dialog.Header>

            <Dialog.Body>
              <Stack gap="4">
                {description ? (
                  <Dialog.Description textStyle="sm" color="fg.muted">
                    {description}
                  </Dialog.Description>
                ) : null}
                <Stack gap="3">{body}</Stack>
              </Stack>
            </Dialog.Body>

            <Dialog.Footer>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isConfirming}
              >
                {cancelLabel ?? t('cancel')}
              </Button>
              <Button
                type="button"
                colorPalette={colorPalette}
                loading={isConfirming}
                disabled={isConfirmDisabled}
                onClick={() => void onConfirm()}
              >
                {confirmLabel}
              </Button>
            </Dialog.Footer>

            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" aria-label={t('close')} />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

/**
 * A description rendered as muted body text.
 *
 * The shared modals take their copy as `ReactNode`, so a caller that has
 * a plain sentence uses this to get the muted styling without repeating
 * it.
 */
export function ModalBodyText({ children }: { children: ReactNode }) {
  return (
    <Text textStyle="sm" color="fg.muted">
      {children}
    </Text>
  );
}
