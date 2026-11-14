# Form reference

## A localized form

See `apps/web/src/features/identity/components/login-form.tsx` for the
complete example. The schema lives beside the feature and holds codes such
as `email_required`. The UI supplies translated labels and maps the codes
to localized text.

```tsx
const form = useForm<LoginFormValues>({
  resolver: zodResolver(loginFormSchema),
  defaultValues: { email: '', password: '' },
});

return (
  <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
    <Stack gap="3">
      <FormTextField name="email" label={t('email')} type="email" control={form.control} />
      <FormTextField name="password" label={t('password')} type="password" control={form.control} />
      <FormSubmitButton mutation={mutation} label={t('submit')} />
    </Stack>
  </form>
);
```

When fields are nested, wrap them with `<FormProvider {...form}>` and let
the primitives read the context.

## Native and compound fields

Use `Field.Root` with `invalid={Boolean(error)}`, `Field.Label`, and
`Field.ErrorText`. For a standalone input outside that structure, link a
translated message explicitly with `aria-describedby` and set
`aria-invalid` when validation fails.

```tsx
<Field.Root invalid={Boolean(errors.title)}>
  <Field.Label>{t('title')}</Field.Label>
  <Input {...register('title')} />
  <Field.ErrorText>
    {errors.title && resolveErrorCode(tError, errors.title.message, tError('unknown'), 'field')}
  </Field.ErrorText>
</Field.Root>

<FormSelect control={control} name="status" label={t('status')}>
  <option value="active">{t('statusActive')}</option>
  <option value="draft">{t('statusDraft')}</option>
</FormSelect>

<FormCheckbox control={control} name="subscribe" label={t('subscribe')} />
```

`NativeSelect.Field` renders a native select. Chakra's portaled
`Select.Root` uses a collection and an array of selected values. For a
single-value schema, give it `value={field.value ? [field.value] : []}`
and map `onValueChange={({ value }) => field.onChange(value[0] ?? '')}`.
Forward the focus ref to `Select.Trigger` and wire field blur when focus
leaves the control. A checkbox uses `checked` and
`onCheckedChange`; pass `field.ref` to its `Checkbox.HiddenInput`.

## Server errors and async state

Use `apiFieldErrorCodes(error)` to read field codes and set each known
field's error with `setError(name, { type: 'server', message: code })`.
For request-wide failures, use `apiErrorCode(error)` and
`resolveErrorCode` to render an `Alert.Root status="error"` near the form.
Use a skeleton while waiting for initial values. For forms that receive
new initial data, call `reset(values)` deliberately and decide whether to
preserve dirty fields. Use `formState.isDirty` for an unsaved-changes prompt.

For a check that needs an API round trip, validate on blur and map the returned
code to the field with `setError`. Keep the check in the feature API hook and
keep the submit-time server validation in place.

## Lint rules

| Rule | Checks |
| --- | --- |
| `no-native-form-controls` | Use Chakra controls or a native hidden input |
| `form-must-use-react-hook-form` | A form uses react-hook-form |
| `form-must-handle-submit` | A form has an `onSubmit` |
| `form-control-must-be-wired` | Form controls have a registration or binding |
| `form-error-must-be-resolved` | Resolve field messages before rendering them |

Verify schema defaults, accessible labels, keyboard operation, and
mutation behavior in the browser.
