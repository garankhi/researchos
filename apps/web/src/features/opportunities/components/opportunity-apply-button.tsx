'use client';

import { Button, Text } from '@chakra-ui/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/ui/feedback';
import { FormModal } from '@/components/ui/form-modal';
import { FormTextarea } from '@/components/ui/form';
import { apiErrorCode } from '@/lib/api-error';
import { resolveErrorCode } from '@/utils/error-messages';

const noteSchema = z.object({
  note: z
    .string()
    .trim()
    .min(1, 'application_note_required')
    .max(10000, 'application_note_too_long'),
});

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
  const [error, setError] = useState<unknown>(null);
  const submitting = useRef(false);

  async function handleApply({ note }: z.infer<typeof noteSchema>) {
    if (submitting.current) return;
    submitting.current = true;
    setError(null);
    try {
      await onApply(note);
      setOpen(false);
    } catch (failure) {
      setError(failure);
    } finally {
      submitting.current = false;
    }
  }

  return (
    <FormModal<z.infer<typeof noteSchema>>
      open={open}
      onClose={() => setOpen(false)}
      title={t('applyTitle')}
      submitLabel={t('applySubmit')}
      isSubmitting={isBusy}
      resolver={zodResolver(noteSchema)}
      defaultValues={{ note: '' }}
      onSubmit={handleApply}
      trigger={
        <Button
          size="sm"
          disabled={!canApply}
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
        >
          {t('apply')}
        </Button>
      }
    >
      <Text textStyle="sm" color="fg.muted">
        {t('applyDescription')}
      </Text>

      <FormTextarea
        name="note"
        label={t('applyNoteLabel')}
        placeholder={t('applyNotePlaceholder')}
        maxLength={10000}
        rows={6}
        disabled={isBusy}
        required
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
    </FormModal>
  );
}
