'use client';

import {
  Button,
  Dialog,
  Portal,
  Stack,
  Text,
  Textarea,
} from '@chakra-ui/react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/ui/feedback';
import { apiErrorCode } from '@/lib/api-error';
import { resolveErrorCode } from '@/utils/error-messages';

/**
 * The action that applies to an opportunity.
 *
 * Applying carries a note to the group that posted the call, so it opens a
 * dialog rather than happening in one click — the applicant gets to say
 * why they are a fit.
 */
export function OpportunityApplyButton({
  canApply,
  onApply,
  isBusy,
}: {
  canApply: boolean;
  onApply: (note: string) => Promise<void>;
  isBusy: boolean;
}) {
  const t = useTranslations('opportunities');
  const tErrors = useTranslations('errors');

  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>(null);

  async function handleApply() {
    setError(null);
    try {
      await onApply(note);
      setNote('');
      setOpen(false);
    } catch (failure) {
      setError(failure);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(details) => {
        if (!isBusy) setOpen(details.open);
      }}
      placement="center"
      size="lg"
      scrollBehavior="inside"
      lazyMount
      unmountOnExit
    >
      <Dialog.Trigger asChild>
        <Button size="sm" disabled={!canApply}>
          {t('apply')}
        </Button>
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content borderRadius="0" shadow="overlayPanel" mx="4">
            <Dialog.Header>
              <Dialog.Title>{t('applyTitle')}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Stack gap="3">
                <Text textStyle="sm" color="fg.muted">
                  {t('applyDescription')}
                </Text>

                <Textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={t('applyNotePlaceholder')}
                  aria-label={t('applyNoteLabel')}
                  maxLength={10000}
                  rows={6}
                  disabled={isBusy}
                />

                {error ? (
                  <ErrorState
                    title={t('applyError')}
                    message={resolveErrorCode(
                      tErrors,
                      apiErrorCode(error),
                      tErrors('unknown'),
                    )}
                  />
                ) : null}
              </Stack>
            </Dialog.Body>
            <Dialog.Footer>
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isBusy}
              >
                {t('cancel')}
              </Button>
              <Button
                loading={isBusy}
                disabled={note.trim().length === 0}
                onClick={() => void handleApply()}
              >
                {t('applySubmit')}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
