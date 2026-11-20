import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@chakra-ui/react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { FormModal } from './form-modal';
import { FormTextField } from './form';

const meta = { title: 'Shared/Form modal' } satisfies Meta;
export default meta;

const schema = z.object({
  email: z.string().trim().min(1, 'validation_failed'),
  note: z.string().trim().max(10, 'validation_failed'),
});

type Values = z.infer<typeof schema>;

function ProfileFormModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('profile');
  const tCommon = useTranslations('common');

  return (
    <FormModal<Values>
      open={open}
      onClose={onClose}
      title={t('editProfileDialogTitle')}
      description={t('editProfileDialogDesc')}
      submitLabel={tCommon('save')}
      resolver={zodResolver(schema)}
      defaultValues={{ email: '', note: '' }}
      onSubmit={async () => {
        onClose();
      }}
    >
      <FormTextField name="email" label={t('fullName')} required />
      <FormTextField name="note" label={t('bio')} />
    </FormModal>
  );
}

export const Default: StoryObj<typeof meta> = {
  globals: { locale: 'en' },
  render: () => <ProfileFormModal open onClose={() => {}} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole('dialog');
    // The dialog animates in, so it is present before it is visible.
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(
      within(dialog).getByRole('textbox', { name: 'Full Name' }),
    ).toBeVisible();
    await expect(
      within(dialog).getByRole('button', { name: 'Save' }),
    ).toBeInTheDocument();
    await expect(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    ).toBeInTheDocument();
  },
};

/**
 * The resolver rejects the empty field, so the form does not submit and
 * the field carries the message.
 */
export const Validation: StoryObj<typeof meta> = {
  globals: { locale: 'en' },
  render: () => <ProfileFormModal open onClose={() => {}} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(
        within(dialog).getByText('The submitted data is invalid.'),
      ).toBeVisible();
    });
  },
};

/**
 * The trigger opens the dialog, and the dialog closes from the top-right
 * rather than from the cancel button.
 */
export const WithTrigger: StoryObj<typeof meta> = {
  globals: { locale: 'en' },
  render: function TriggerStory() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open</Button>
        <ProfileFormModal open={open} onClose={() => setOpen(false)} />
      </>
    );
  },
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('button', { name: 'Open' }));
    const dialog = await body.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
  },
};
