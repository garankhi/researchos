---
name: researchos-forms
description: Build ResearchOS web forms with react-hook-form, Zod, Chakra UI v3 and localized validation. Use for new forms, field controls, submit handling and server field errors in apps/web.
---

# ResearchOS forms

Define a Zod schema whose validation messages are error codes. Infer the values
with `z.infer` and pass `zodResolver(schema)` and defaults to `useForm`. Give
each controlled field a default value appropriate to its type.

Use `FormTextField`, `FormSelect`, and `FormCheckbox` from
`src/components/ui/form.tsx`. Pass `control` or wrap the fields in
`FormProvider`. The primitives use Chakra's `Field.Root` and associate labels
and feedback with the actual controls.

For a new field, use Chakra `Input`, `Textarea`, or `NativeSelect.Field` with
`register` when the control exposes the native ref and change event. For
compound controls such as `Select.Root` and `Checkbox.Root`, adapt
`onValueChange` or `onCheckedChange` with `Controller`. Attach the field ref
to a focusable control so validation can focus the first invalid field.

Submit with `handleSubmit`. Pass the mutation to `FormSubmitButton` so its
pending state controls the spinner and disabled state. Put server field
errors into the form with `setError` and show other failures in an inline
Chakra alert. Resolve every error code through the message catalog. Reserve the
snackbar for confirmations and failures with no local control or panel.

## Verification

- Check field focus, accessible labels, inline validation, server errors and duplicate submissions.
- Register new error codes in both catalogs and in the shared registry.
- Run `pnpm --filter web lint` and `pnpm --filter web test`. Update a story when a display state or interaction changes.

See the [form reference](reference.md) for wiring and lint examples.
