import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { expect } from 'storybook/test';
import { FormSelect, FormTextField } from './form';

const meta = { title: 'Shared/Form fields' } satisfies Meta;
export default meta;

function FieldsWithCustomIds() {
  const t = useTranslations('identity');
  const nav = useTranslations('nav');
  const { control } = useForm({
    defaultValues: { email: '', account: 'profile' },
  });

  return (
    <>
      <FormTextField
        id="contact-email"
        name="email"
        label={t('email')}
        control={control}
      />
      <FormSelect
        id="account-section"
        name="account"
        label={nav('account')}
        control={control}
      >
        <option value="profile">{nav('profile')}</option>
      </FormSelect>
    </>
  );
}

export const CustomIds: StoryObj<typeof meta> = {
  globals: { locale: 'en' },
  render: () => <FieldsWithCustomIds />,
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('textbox', { name: 'Email' }),
    ).toHaveAttribute('id', 'contact-email');
    await expect(
      canvas.getByRole('combobox', { name: 'Account' }),
    ).toHaveAttribute('id', 'account-section');
  },
};
