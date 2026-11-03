---
name: researchos-forms
description: Builds forms in the ResearchOS web app — react-hook-form for state, zod for validation, MUI form components for rendering, and the message catalog for every label and error. Covers the schema-first shape, the MUI ref trap, mapping server-side field errors back onto inputs, and the eslint rules that enforce all of it. Use when creating or changing a form, a validation schema, a submit handler, or an input in apps/web, or when the user mentions forms, react-hook-form, useForm, Controller, register, zod, validation, input, form submission, or field errors.
---

# ResearchOS forms

How to build a form in `apps/web`. A form is four things working together:
a **schema** that says what is valid, a **controller** that holds the state, a
**set of MUI controls** that render it, and a **catalog** that holds every
word the user reads.

None of them is optional, and none of them substitutes for another.

## The stack

| Layer | Library | Owns |
| --- | --- | --- |
| Validation | `zod` | What is valid, and the error **code** per failure |
| State | `react-hook-form` | Field values, touched state, submit handling |
| Rendering | `@mui/material` | The controls the user sees |
| Wording | `next-intl` | Every label and every error message |

`react-hook-form` and `@hookform/resolvers` and `zod` are installed in
`apps/web`.

## The five rules

**Four are enforced by eslint**, in
`apps/web/eslint-rules/researchos-forms.mjs`.

| # | Rule | Enforced by |
| --- | --- | --- |
| 1 | Form controls are MUI components | `researchosForms/no-native-form-controls` |
| 2 | A `<form>` is driven by `useForm` | `researchosForms/form-must-use-react-hook-form` |
| 3 | A `<form>` handles its submit event | `researchosForms/form-must-handle-submit` |
| 4 | Every control is registered or controlled | `researchosForms/form-control-must-be-wired` |
| 5 | A field error is resolved through the catalog | `researchosForms/form-error-must-be-resolved` |

There is a sixth rule, `researchosForms/select-requires-controller`, that
covers the MUI `select` trap described below.

### 1. Form controls are MUI components

```typescript
// Wrong — no theme, no dark mode, no shared styling.
<input name="title" />

// Right
<TextField label={t('title')} {...register('title')} />
```

The one exception is `<input type="hidden">`, which react-hook-form needs
for a hidden field.

### 2. A `<form>` is driven by `useForm`

A form with hand-rolled `useState` per field cannot show which field
failed, cannot reset, and cannot map a server-side field error back onto
the input that caused it. That last one is the whole point.

### 3. A `<form>` handles its submit event

Without `onSubmit`, submitting reloads the page and discards everything the
user typed.

### 4. Every control is registered or controlled

This is the rule that catches the worst bug: a control that renders but is
never bound. The form submits, the field is silently empty, and the server
rejects it.

A control is bound when it has any of:

- `{...register('name')}` — the plain text field
- `{...field}` inside a `<Controller>` — the select and the toggle
- `value` + `onChange`, or `checked` + `onChange` — an explicitly
  controlled control
- a `name` of its own

### 5. A field error is resolved through the catalog

The error message is a **code**, not a sentence. Rendering it raw puts
`title_required` on the screen.

```typescript
// Wrong — the user reads `title_required`.
helperText={formState.errors.title?.message}

// Right
helperText={resolveErrorCode(t, formState.errors.title?.message, t('unknown'), 'field')}
```

## The shape of a form

### The schema comes first

The schema is the contract, and it lives with the feature — not in a
shared file, because the rules differ per form.

```typescript
// features/profile/schemas/profile-form.schema.ts
import { z } from 'zod';

export const profileFormSchema = z.object({
  title: z.string().min(1, 'title_required'),
  email: z.string().email('email_invalid'),
  status: z.enum(['draft', 'active'], { error: 'status_invalid' }),
  subscribe: z.boolean(),
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;
```

**The zod message is the error code.** `min(1, 'title_required')` — the
code, not a sentence. The catalog holds the wording:

```json
{ "errors": { "codes": { "title_required": "Tiêu đề là bắt buộc." } } }
```

This is the same contract the backend uses for its validation codes, so
a field error looks the same whether it came from the schema or from the
server. See the `researchos-localization` skill.

### The component

```tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { FormSubmitButton, FormTextField } from '@/components/ui/form';
import { profileFormSchema } from '../schemas/profile-form.schema';
import type { ProfileFormValues } from '../schemas/profile-form.schema';

export function ProfileForm() {
  const t = useTranslations('profile');
  const tError = useTranslations('errors');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: { title: '', email: '', status: 'draft', subscribe: false },
  });

  const mutation = useCreateProfile();

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FormTextField name="title" label={t('title')} error={Boolean(errors.title)} />
      <FormSubmitButton mutation={mutation} label={t('save')} />
    </form>
  );
}
```

## The shared primitives

`components/ui/form.tsx` holds `FormTextField`, `FormSelect`,
`FormCheckbox` and `FormSubmitButton`. Use them instead of hand-rolling the
wiring — each one registers the control, reflects the error state onto the
MUI control, and resolves the error message through the catalog.

   | Primitive | Use for | Wiring |
| --- | --- | --- |
| `FormTextField` | A text input | `register` |
| `FormSelect` | A dropdown | `Controller` |
| `FormCheckbox` | A toggle | `Controller` |
| `FormSubmitButton` | The submit button | the mutation's `isPending` |

They read the form from `useFormContext()`, so the form component must
wrap its children in `<FormProvider>`.

## The two MUI traps

### The ref trap

MUI v9's `TextField` forwards `ref` to the root `FormControl` and
`inputRef` to the DOM `<input>`. react-hook-form needs the DOM input, so
the ref goes to `inputRef`.

```typescript
// Wrong — the ref lands on the root div, so RHF cannot focus the field.
const { ref, ...registration } = register('title');
<TextField {...registration} ref={ref} />

// Right
const { ref, ...registration } = register('title');
<TextField {...registration} inputRef={ref} />
```

`FormTextField` already does this. If you write the control yourself, the
ref must reach the input.

### The select trap

MUI's `Select` renders a hidden input plus a listbox. `register` does not
drive the displayed value, so a select needs a `Controller`:

```typescript
// Wrong — the spread does not drive the displayed value.
<TextField select {...register('status')} />

// Right
<Controller
  control={control}
  name="status"
  render={({ field }) => (
    <TextField select {...field}>
      <MenuItem value="draft">{t('statusDraft')}</MenuItem>
    </TextField>
  )}
/>
```

A toggle has the mirror problem: it reports its state through `checked`,
not `value`, so it needs a `Controller` too.

## Where the errors come from

Two sources, one resolution path.

### From the schema

The zod message is the code. `resolveErrorCode()` turns it into a
sentence. Validation codes live in the **field** tier of the catalog
(`errors.codes.fields.*`), so pass `'field'` as the kind.

### From the server

A `400` carries `errors` grouped by field. The codes in
`errors[].messages` resolve the same way — through `resolveFieldErrorCodes()`.

```typescript
import { apiFieldErrorCodes } from '@/lib/api-error';
import { resolveFieldErrorCodes } from '@/utils/error-messages';

const fieldMessages = resolveFieldErrorCodes(
  tError,
  apiFieldErrorCodes(mutation.error),
  tError('unknown'),
);
```

Map them back onto the inputs with `setError`, so the field shows the
error the server sent:

```typescript
onError: (error) => {
  const codes = apiFieldErrorCodes(error);

  if (!codes) return;

  for (const [field, messages] of Object.entries(codes)) {
    setError(field as keyof ProfileFormValues, {
      type: 'server',
      message: messages[0],
    });
  }
}
```

> The backend does not send codes yet — it sends English prose — so today
> every server-side code resolves to the fallback. See "The current gap" in
> the `researchos-localization` skill.

## Submit handling

`handleSubmit` takes an async handler. A `400` must not throw — react-hook-form
treats a rejected promise as a submit error and swallows it.

```typescript
const onSubmit = handleSubmit(async (values) => {
  try {
    await mutation.mutateAsync(values);
    showSnackbar({ severity: 'success', message: t('saved') });
  } catch (error) {
    // The `400` path — map the server's field errors onto the inputs.
    applyServerErrors(error);
  }
});
```

Three outcomes, three behaviours:

| Outcome | Behaviour |
| --- | --- |
| Schema fails | react-hook-form blocks the submit and shows the errors |
| Server returns `400` | Map the field errors onto the inputs; keep the user on the page |
| Server returns `5xx` | Show an `ErrorState` with a retry |

The submit button uses `FormSubmitButton`, which is bound to the
**mutation's** `isPending`.

```tsx
<FormSubmitButton mutation={mutation} label={t('save')} />
```

### Why the mutation's flag and not the form's

react-hook-form's `isSubmitting` is true from the moment the submit handler
starts until its promise settles. A form that validates and then fires a
mutation spends that time in two phases — and the request the user cares
about is the second one. Bound to `isSubmitting`, the spinner appears
during client-side validation and can stop before the server has answered.

The mutation's `isPending` covers exactly the window that matters: the
request is in flight. MUI v9's `loading` prop renders the spinner and
disables the button, so a double submit is impossible while it runs.

A **query's** `isPending` is never the right flag: it means "no data yet",
and for a query with `enabled: false` it stays `true` forever, so the
button would be permanently disabled.

## Checklist

- [ ] The schema lives in the feature, and its messages are **codes**
- [ ] Every code the schema can produce has an entry in `messages/vi.json` **and** `messages/en.json` under `errors.codes.fields`
- [ ] `useForm` is called with a `zodResolver` and explicit `defaultValues`
- [ ] The `<form>` has `onSubmit={handleSubmit(...)}`
- [ ] Every control is registered or controlled — no unbound input
- [ ] The MUI `TextField` ref goes to `inputRef`, not `ref`
- [ ] A select or a toggle uses a `Controller`, not `register`
- [ ] Field errors are resolved with `resolveErrorCode()`, never rendered raw
- [ ] Server-side field errors are mapped onto the inputs with `setError`
- [ ] A `400` is caught, not thrown
- [ ] The submit button is `FormSubmitButton`, bound to the mutation's `isPending`
- [ ] Success shows a snackbar; failure shows an inline error

## Reference

Field-by-field recipes, the `FormProvider` wiring, and the server-error
mapping in full: [reference.md](reference.md).

Screen conventions — where a message goes, which primitive to use:
`researchos-ui`. Wording and the catalogs: `researchos-localization`.
