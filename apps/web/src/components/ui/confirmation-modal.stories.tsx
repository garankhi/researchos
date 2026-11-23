import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button, RadioGroup, Stack } from '@chakra-ui/react';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { ConfirmationModal } from './confirmation-modal';

const meta = { title: 'Shared/Confirmation modal' } satisfies Meta;
export default meta;

/**
 * When the answer is a set of choices, the choices go in the body.
 */
export const WithChoices: StoryObj<typeof meta> = {
  globals: { locale: 'en' },
  render: function ChoiceStory() {
    const [value, setValue] = useState('public');
    return (
      <ConfirmationModal
        open
        onClose={() => {}}
        title="Change visibility"
        description="Who can see this work."
        body={
          <RadioGroup.Root
            value={value}
            onValueChange={(details) => setValue(details.value ?? 'public')}
          >
            <Stack gap="3">
              <RadioGroup.Item value="public">
                <RadioGroup.ItemHiddenInput />
                <RadioGroup.ItemIndicator />
                <RadioGroup.ItemText>FPTU Community</RadioGroup.ItemText>
              </RadioGroup.Item>
              <RadioGroup.Item value="group">
                <RadioGroup.ItemHiddenInput />
                <RadioGroup.ItemIndicator />
                <RadioGroup.ItemText>Research group</RadioGroup.ItemText>
              </RadioGroup.Item>
            </Stack>
          </RadioGroup.Root>
        }
        confirmLabel="Save"
        colorPalette="blue"
        onConfirm={() => {}}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(
      within(dialog).getByRole('radio', { name: 'Research group' }),
    ).toBeInTheDocument();
    await expect(
      within(dialog).getByRole('button', { name: 'Save' }),
    ).toBeInTheDocument();
  },
};

export const Default: StoryObj<typeof meta> = {
  globals: { locale: 'en' },
  render: () => (
    <ConfirmationModal
      open
      onClose={() => {}}
      title="Withdraw application"
      description="Withdrawing tells the group you are no longer applying. You can apply again later."
      confirmLabel="Withdraw"
      onConfirm={() => {}}
    />
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole('dialog');
    // The dialog animates in, so it is present before it is visible.
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(
      within(dialog).getByRole('button', { name: 'Withdraw' }),
    ).toBeInTheDocument();
    await expect(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    ).toBeInTheDocument();
  },
};

/**
 * A confirmation does not have to be destructive, so the palette is the
 * caller's to choose.
 */
export const NeutralPalette: StoryObj<typeof meta> = {
  globals: { locale: 'en' },
  render: () => (
    <ConfirmationModal
      open
      onClose={() => {}}
      title="Archive opportunity"
      description="Archiving hides the opportunity from the group's page. You can restore it later."
      confirmLabel="Archive"
      colorPalette="gray"
      onConfirm={() => {}}
    />
  ),
};

export const WithTrigger: StoryObj<typeof meta> = {
  globals: { locale: 'en' },
  render: function TriggerStory() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button colorPalette="red" onClick={() => setOpen(true)}>
          Remove member
        </Button>
        <ConfirmationModal
          open={open}
          onClose={() => setOpen(false)}
          title="Remove member"
          description="The member loses access to the group straight away."
          confirmLabel="Remove"
          onConfirm={() => {}}
        />
      </>
    );
  },
  play: async ({ canvas, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Remove member' }),
    );
    const dialog = await body.findByRole('dialog');
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(
      within(dialog).getByRole('button', { name: 'Remove' }),
    ).toBeInTheDocument();
  },
};
