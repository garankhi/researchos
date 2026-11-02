'use client';

import { Controller, useFormContext, useFormState } from 'react-hook-form';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import TextField from '@mui/material/TextField';
import type { TextFieldProps } from '@mui/material/TextField';
import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import type { FormControlLabelProps } from '@mui/material/FormControlLabel';
import { resolveErrorCode } from '@/utils/error-messages';

/**
 * Shared form field primitives.
 *
 * These exist so the conventions in the `researchos-forms` skill are the
 * path of least resistance. Each one wires a control to react-hook-form,
 * reflects the field's error state onto the MUI control, and resolves the
 * error message through the message catalog — the three things that are
 * easy to get wrong and that the eslint rules check for.
 *
 * The rules are in `apps/web/eslint-rules/researchos-forms.mjs`.
 */

type BaseFieldProps<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
> = {
  /** The field name, matching the zod schema key. */
  name: TName;
  /** The label shown on the control. Always a translated string. */
  label: string;
  /** Helper text shown when the field is valid. */
  helperText?: string;
  /**
   * The form control. Optional: when it is omitted the field reads the
   * surrounding `<FormProvider>`.
   */
  control?: Control<TValues>;
};

/**
 * Resolves the control from the prop or the surrounding provider.
 *
 * `useFormContext()` returns `null` outside a `<FormProvider>`, so a
 * primitive that relied on it alone would throw on a form that keeps
 * everything in one component. Passing `control` explicitly is the way to
 * use these without a provider.
 */
function useResolvedControl<TValues extends FieldValues>(
  controlProp: Control<TValues> | undefined,
  component: string,
): Control<TValues> {
  const context = useFormContext<TValues>();
  const control = controlProp ?? context?.control;

  if (!control) {
    throw new Error(
      `${component} needs a form. Wrap the form in a <FormProvider>, or pass the \`control\` prop.`,
    );
  }

  return control;
}

/**
 * Reads a field's error message as a plain string.
 *
 * react-hook-form types the message as `string | FieldError` because a
 * nested error object is legal, but the resolver always produces a string
 * here — zod's message is the code the catalog resolves.
 */
function messageOf(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;

  const message = (error as { message?: unknown }).message;

  return typeof message === 'string' ? message : undefined;
}

/**
 * A text field bound to react-hook-form.
 *
 * The control is registered with the form, so the value is submitted and
 * validated like any other field. The error message is resolved through
 * the catalog — the raw code never reaches the screen.
 *
 * The ref goes to `inputRef`, not `ref`. MUI v9 forwards `ref` to the root
 * `FormControl` and `inputRef` to the DOM `<input>`; react-hook-form needs
 * the DOM input so it can focus the first invalid field.
 *
 * ```tsx
 * <FormTextField name="title" label={t('title')} />
 * ```
 */
export function FormTextField<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
>({
  name,
  label,
  helperText,
  control: controlProp,
  ...inputProps
}: BaseFieldProps<TValues, TName> &
  Omit<TextFieldProps, 'name' | 'label' | 'helperText'>) {
  const t = useTranslations('errors');
  const control = useResolvedControl(controlProp, 'FormTextField');

  const { errors } = useFormState({ control });
  const error = errors[name];
  const message = messageOf(error);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <TextField
          {...inputProps}
          {...field}
          label={label}
          error={Boolean(error)}
          helperText={
            message
              ? resolveErrorCode(t, message, t('unknown'), 'field')
              : helperText
          }
          inputRef={field.ref}
        />
      )}
    />
  );
}

/**
 * A select bound to react-hook-form.
 *
 * MUI's `Select` renders a hidden input plus a listbox, so `register` does
 * not drive the displayed value — it needs a `Controller`. This component
 * does that wiring so the caller does not have to remember it.
 *
 * ```tsx
 * <FormSelect name="status" label={t('status')}>
 *   <MenuItem value="active">{t('statusActive')}</MenuItem>
 * </FormSelect>
 * ```
 */
export function FormSelect<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
>({
  name,
  label,
  helperText,
  children,
  control: controlProp,
  ...selectProps
}: BaseFieldProps<TValues, TName> & {
  children: React.ReactNode;
} & Omit<TextFieldProps, 'name' | 'label' | 'helperText' | 'select'>) {
  const t = useTranslations('errors');
  const control = useResolvedControl(controlProp, 'FormSelect');

  const { errors } = useFormState({ control });
  const error = errors[name];
  const message = messageOf(error);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <TextField
          {...selectProps}
          {...field}
          select
          label={label}
          error={Boolean(error)}
          helperText={
            message
              ? resolveErrorCode(t, message, t('unknown'), 'field')
              : helperText
          }
        >
          {children}
        </TextField>
      )}
    />
  );
}

/**
 * A checkbox bound to react-hook-form.
 *
 * A toggle reports its state through `checked`, not `value`, so it needs
 * its own wiring rather than a plain `register` spread.
 *
 * ```tsx
 * <FormCheckbox name="subscribe" label={t('subscribe')} />
 * ```
 */
export function FormCheckbox<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
>({
  name,
  label,
  control: controlProp,
  ...labelProps
}: Omit<BaseFieldProps<TValues, TName>, 'helperText'> &
  Omit<Partial<FormControlLabelProps>, 'label' | 'control'>) {
  const control = useResolvedControl(controlProp, 'FormCheckbox');

  const { errors } = useFormState({ control });
  const error = errors[name];

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        // MUI v9's `Checkbox` and `FormControlLabel` take no error prop, so
        // the error state belongs on the `FormControl` that wraps them.
        <FormControl error={Boolean(error)} component="fieldset">
          <FormControlLabel
            {...labelProps}
            control={
              <Checkbox
                checked={Boolean(field.value)}
                onChange={(event) => field.onChange(event.target.checked)}
                onBlur={field.onBlur}
                name={field.name}
                ref={field.ref}
              />
            }
            label={label}
          />
        </FormControl>
      )}
    />
  );
}
