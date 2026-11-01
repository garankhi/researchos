# ResearchOS forms — reference

Copy-paste templates and the details behind the rules in
[SKILL.md](SKILL.md).

## Contents

- [The full form](#the-full-form)
- [The FormProvider wiring](#the-formprovider-wiring)
- [Server error mapping](#server-error-mapping)
- [Field recipes](#field-recipes)
- [Async validation](#async-validation)
- [Reset and dirty state](#reset-and-dirty-state)
- [The eslint rules](#the-eslint-rules)
- [What the rules do not catch](#what-the-rules-do-not-catch)

## The full form

A complete, working form with a schema, a server call, and the server's
field errors mapped back onto the inputs.

```tsx
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { Alert, Box, Button, Stack } from '@mui/material';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import { FormTextField, FormSelect, FormCheckbox } from '@/components/ui/form';
import { apiFieldErrorCodes } from '@/lib/api-error';
import { resolveFieldErrorCodes } from '@/utils/error-messages';
import { useCreateProfile } from '../hooks/use-create-profile';
import { profileFormSchema } from '../schemas/profile-form.schema';
import type { ProfileFormValues } from '../schemas/profile-form.schema';

export function ProfileForm() {
  const t = useTranslations('profile');
  const tError = useTranslations('errors');
  const { showSnackbar } = useSnackbar();

  const [serverMessage, setServerMessage] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      title: '',
      email: '',
      status: 'draft',
      subscribe: false,
    },
  });

  const mutation = useCreateProfile();

  const onSubmit = handleSubmit(async (values) => {
    setServerMessage(null);

    try {
      await mutation.mutateAsync(values);
      showSnackbar({ severity: 'success', message: t('saved') });
    } catch (error) {
      // The `400` path: the server rejected specific fields.
      const codes = apiFieldErrorCodes(error);

      if (!codes) {
        // Not a field error — a server or network failure.
        setServerMessage(
          resolveFieldErrorCodes(tError, { global: ['server_error'] }, tError('unknown'))?.global,
        );
        return;
      }

      for (const [field, messages] of Object.entries(codes)) {
        setError(field as keyof ProfileFormValues, {
          type: 'server',
          message: messages[0],
        });
      }
    }
  });

  return (
    <Box component="form" onSubmit={onSubmit} noValidate>
      <Stack spacing={2}>
        {serverMessage ? (
          <Alert severity="error">{serverMessage}</Alert>
        ) : null}

        <FormTextField
          name="title"
          label={t('title')}
          error={Boolean(errors.title)}
        />

        <FormTextField
          name="email"
          label={t('email')}
          type="email"
          error={Boolean(errors.email)}
        />

        <FormSelect name="status" label={t('status')}>
          <MenuItem value="draft">{t('statusDraft')}</MenuItem>
          <MenuItem value="active">{t('statusActive')}</MenuItem>
        </FormSelect>

        <FormCheckbox name="subscribe" label={t('subscribe')} />

        <Button type="submit" loading={isSubmitting}>
          {t('save')}
        </Button>
      </Stack>
    </Box>
  );
}
```

## The FormProvider wiring

`FormTextField`, `FormSelect` and `FormCheckbox` read the form from
`useFormContext()`, so the component that calls `useForm` must provide it.

```tsx
'use client';

import { FormProvider, useForm } from 'react-hook-form';

export function ProfileFormProvider({ children }: { children: React.ReactNode }) {
  const methods = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: { title: '', email: '', status: 'draft', subscribe: false },
  });

  return <FormProvider {...methods}>{children}</FormProvider>;
}
```

A field component then needs no props beyond the field itself:

```tsx
'use client';

export function ProfileFields() {
  const t = useTranslations('profile');

  return (
    <Stack spacing={2}>
      <FormTextField name="title" label={t('title')} />
      <FormSelect name="status" label={t('status')}>
        <MenuItem value="draft">{t('statusDraft')}</MenuItem>
      </FormSelect>
    </Stack>
  );
}
```

The provider and the fields can live in different files, or the same one.
A provider is only needed when the fields are a separate component.

## Server error mapping

A `400` from the API carries the failing fields:

```json
{
  "success": false,
  "message": "validation_failed",
  "statusCode": 400,
  "errors": [{ "field": "title", "messages": ["title_required"] }]
}
```

`apiFieldErrorCodes()` turns that into `{ title: ['title_required'] }`.
`setError` puts it on the input.

```typescript
const applyServerErrors = (error: unknown) => {
  const codes = apiFieldErrorCodes(error);

  if (!codes) return false;

  for (const [field, messages] of Object.entries(codes)) {
    setError(field as keyof ProfileFormValues, {
      type: 'server',
      message: messages[0],
    });
  }

  return true;
};
```

Several constraints can fail on one field. `setError` takes one message, so
the first one wins — unless the field's error is rendered from the whole
list:

```typescript
const fieldMessages = resolveFieldErrorCodes(
  tError,
  apiFieldErrorCodes(error),
  tError('unknown'),
);

// { title: 'Tiêu đề là bắt buộc, Tiêu đề không được vượt quá 200 ký tự' }
```

## Field recipes

### Text field

```tsx
const { ref, ...registration } = register('title');

<TextField
  label={t('title')}
  error={Boolean(errors.title)}
  helperText={resolveErrorCode(tError, errors.title?.message, tError('unknown'))}
  {...registration}
  inputRef={ref}
/>
```

`inputRef` is not optional here — MUI forwards `ref` to the root
`FormControl`, and react-hook-form needs the DOM input.

### Multiline

```tsx
<TextField
  label={t('description')}
  multiline
  minRows={4}
  {...registration}
  inputRef={ref}
/>
```

### Select

```tsx
<Controller
  control={control}
  name="status"
  render={({ field }) => (
    <TextField select label={t('status')} {...field}>
      <MenuItem value="draft">{t('statusDraft')}</MenuItem>
      <MenuItem value="active">{t('statusActive')}</MenuItem>
    </TextField>
  )}
/>
```

### Checkbox

```tsx
<Controller
  control={control}
  name="subscribe"
  render={({ field }) => (
    <FormControl error={Boolean(errors.subscribe)} component="fieldset">
      <FormControlLabel
        control={
          <Checkbox
            checked={Boolean(field.value)}
            onChange={(event) => field.onChange(event.target.checked)}
            onBlur={field.onBlur}
            name={field.name}
            ref={field.ref}
          />
        }
        label={t('subscribe')}
      />
    </FormControl>
  )}
/>
```

MUI v9's `Checkbox` and `FormControlLabel` take no `error` prop — the
error state belongs on the `FormControl` that wraps them.

### Radio group

```tsx
<Controller
  control={control}
  name="visibility"
  render={({ field }) => (
    <FormControl error={Boolean(errors.visibility)}>
      <FormLabel>{t('visibility')}</FormLabel>
      <RadioGroup row {...field}>
        <FormControlLabel value="public" control={<Radio />} label={t('public')} />
        <FormControlLabel value="private" control={<Radio />} label={t('private')} />
      </RadioGroup>
    </FormControl>
  )}
/>
```

### Autocomplete

An `Autocomplete` takes an array, so it needs a `Controller` and a
`getOptionLabel`:

```tsx
<Controller
  control={control}
  name="tags"
  render={({ field }) => (
    <Autocomplete
      multiple
      options={options}
      value={field.value ?? []}
      onChange={(_, value) => field.onChange(value)}
      onBlur={field.onBlur}
      getOptionLabel={(option) => option.label}
      renderInput={(params) => <TextField {...params} label={t('tags')} />}
    />
  )}
/>
```

### Hidden field

```tsx
<input type="hidden" {...register('id')} />
```

The one native control the rules allow. react-hook-form needs a real DOM
input for a hidden field.

## Async validation

A field that must be checked against the server — an email already taken,
a slug already claimed:

```typescript
const { register, setError, clearErrors } = useForm<ProfileFormValues>({
  resolver: zodResolver(profileFormSchema),
  mode: 'onBlur',
});

const checkEmail = register('email', {
  validate: async (value) => {
    const taken = await profileApi.isEmailTaken(value);

    return taken ? 'email_already_registered' : true;
  },
});
```

The validator returns the **code**, or `true`. `false` is a code too, but
a named one resolves through the catalog.

`mode: 'onBlur'` is the default for async validation — validating on every
keystroke fires a request per character.

## Reset and dirty state

```typescript
const { reset, formState: { isDirty, dirtyFields } } = useForm();

// After a successful create, replace the values.
reset({ title: '', email: '', status: 'draft', subscribe: false });

// After a successful update, adopt the server's values.
reset(values, { keepDirty: false });

// Warn before leaving a dirty form.
isDirty;                 // any field changed
dirtyFields.title;       // one field changed
```

`reset()` after a successful update is important: the form holds the old
values, and the user sees the stale ones until they reload.

## The eslint rules

The rules live in `apps/web/eslint-rules/researchos-forms.mjs` and are
registered in `apps/web/eslint.config.mjs` under the `researchosForms`
plugin.

| Rule | Fires on |
| --- | --- |
| `no-native-form-controls` | `<input>`, `<select>`, `<textarea>` — except `type="hidden"` |
| `form-must-use-react-hook-form` | A `<form>` in a file that does not import `useForm` |
| `form-must-handle-submit` | A `<form>` with no `onSubmit` |
| `form-control-must-be-wired` | A MUI control with no binding |
| `select-requires-controller` | A `<TextField select>` registered with `register()` |
| `form-error-must-be-resolved` | An error message rendered without `resolveErrorCode()` |

The last two are the ones a compiler cannot catch. Both compile cleanly
and both fail at runtime — the first submits an empty field, the second
shows `title_required` to the user.

To see them fire, write a deliberately broken form and run:

```powershell
pnpm --filter web exec eslint src/features/<domain>/components/<form>.tsx
```

## What the rules do not catch

The rules check the wiring, not the content. These still need a reviewer's
eye:

- **A schema that does not match the DTO.** The backend's `class-validator`
  decorators and the frontend's zod schema are two statements of the same
  rule, and they can drift. When a DTO changes, change both.
- **A default value that contradicts the schema.** `defaultValues` is not
  validated on mount, so a default outside the schema's range sits there
  silently until the user edits the field.
- **A submit that swallows the error.** A `catch` block that does nothing
  turns a failed save into a button that appears to do nothing.
- **A label that is not translated.** The rules do not read string literals.
