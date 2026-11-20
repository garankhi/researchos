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
 * destructive.
 */
export function ConfirmationModal({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  onConfirm,
  isConfirming = false,
  isConfirmDisabled = false,
  cancelLabel,
  colorPalette = 'red',
  size = 'md',
}: {
  /** Whether the dialog is open. */
  open: boolean;
  /** Called when the dialog asks to close. */
  onClose: () => void;
  title: ReactNode;
  /** The body of the dialog. */
  description?: ReactNode;
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
              <Stack gap="3">
                {typeof description === 'string' ? (
                  <Text textStyle="sm" color="fg.muted">
                    {description}
                  </Text>
                ) : (
                  description
                )}
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
