'use client';

import {
  Button,
  Checkbox,
  Field,
  Input,
  NativeSelect,
  type ButtonProps,
  type InputProps,
  type NativeSelectFieldProps,
} from '@chakra-ui/react';
import {
  useController,
  useFormContext,
  type Control,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { resolveErrorCode } from '@/utils/error-messages';

type FieldProps<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
> = {
  name: TName;
  label: string;
  helperText?: string;
  control?: Control<TValues>;
  disabled?: boolean;
  required?: boolean;
};

function useFormField<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
>({
  name,
  control: controlProp,
  disabled,
}: Pick<FieldProps<TValues, TName>, 'name' | 'control' | 'disabled'>) {
  const context = useFormContext<TValues>();
  const control = controlProp ?? context?.control;
  if (!control) {
    throw new Error(
      'Form fields need a control prop or a surrounding FormProvider.',
    );
  }

  const { field, fieldState } = useController({ name, control, disabled });
  const t = useTranslations('errors');
  const code = fieldState.error?.message;

  return {
    ...field,
    invalid: fieldState.invalid,
    errorMessage: code
      ? resolveErrorCode(t, code, t('unknown'), 'field')
      : undefined,
  };
}

function FieldMessage({
  error,
  helperText,
}: {
  error?: string;
  helperText?: string;
}) {
  if (error) return <Field.ErrorText>{error}</Field.ErrorText>;
  if (helperText) return <Field.HelperText>{helperText}</Field.HelperText>;
  return null;
}

export function FormTextField<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
>({
  id,
  name,
  label,
  helperText,
  control,
  disabled,
  required,
  ...inputProps
}: FieldProps<TValues, TName> &
  Omit<
    InputProps,
    'name' | 'value' | 'defaultValue' | 'onChange' | 'onBlur' | 'ref'
  >) {
  const { invalid, errorMessage, ...field } = useFormField({
    name,
    control,
    disabled,
  });

  return (
    <Field.Root
      id={id}
      invalid={invalid}
      disabled={field.disabled}
      required={required}
    >
      <Field.Label>{label}</Field.Label>
      <Input {...inputProps} {...field} value={field.value ?? ''} />
      <FieldMessage error={errorMessage} helperText={helperText} />
    </Field.Root>
  );
}

export function FormSelect<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
>({
  id,
  name,
  label,
  helperText,
  control,
  disabled,
  required,
  children,
  ...selectProps
}: FieldProps<TValues, TName> &
  Omit<
    NativeSelectFieldProps,
    'name' | 'value' | 'defaultValue' | 'onChange' | 'onBlur' | 'ref'
  >) {
  const { invalid, errorMessage, ...field } = useFormField({
    name,
    control,
    disabled,
  });

  return (
    <Field.Root
      id={id}
      invalid={invalid}
      disabled={field.disabled}
      required={required}
    >
      <Field.Label>{label}</Field.Label>
      <NativeSelect.Root>
        <NativeSelect.Field
          {...selectProps}
          {...field}
          value={field.value ?? ''}
        >
          {children}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
      <FieldMessage error={errorMessage} helperText={helperText} />
    </Field.Root>
  );
}

export function FormCheckbox<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
>({
  name,
  label,
  helperText,
  control,
  disabled,
  required,
}: FieldProps<TValues, TName>) {
  const {
    invalid,
    errorMessage,
    name: fieldName,
    value,
    onChange,
    onBlur,
    ref,
    disabled: fieldDisabled,
  } = useFormField({
    name,
    control,
    disabled,
  });

  return (
    <Field.Root invalid={invalid} disabled={fieldDisabled} required={required}>
      <Checkbox.Root
        name={fieldName}
        checked={Boolean(value)}
        onCheckedChange={({ checked }) => onChange(checked === true)}
      >
        <Checkbox.HiddenInput ref={ref} onBlur={onBlur} />
        <Checkbox.Control />
        <Checkbox.Label>{label}</Checkbox.Label>
      </Checkbox.Root>
      <FieldMessage error={errorMessage} helperText={helperText} />
    </Field.Root>
  );
}

export function FormSubmitButton({
  mutation,
  label,
  ...buttonProps
}: {
  mutation: { isPending: boolean };
  label: React.ReactNode;
} & Omit<ButtonProps, 'loading' | 'type'>) {
  return (
    <Button type="submit" loading={mutation.isPending} {...buttonProps}>
      {label}
    </Button>
  );
}
