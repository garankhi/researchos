# Loading and feedback

Skeletons, mutation indicators, the snackbar provider, and where a message
belongs.

## Loading states

Two different kinds of waiting, two different treatments.

| What is loading | Use |
| --- | --- |
| A block of content that will be replaced by data (list, card, detail panel) | **Skeleton** — reserves the space, prevents layout shift |
| A mutation in flight (submit, save, delete) | **Spinner in the button** — the layout does not change |

### Skeletons for block loading

A spinner hides the layout; a skeleton reserves the space and prevents a
layout shift when data arrives. Use skeletons whenever the thing being loaded
*occupies an area* of the page.

Shared primitives in `components/ui/feedback.tsx`: `LoadingSkeleton` (a
block of content — `variant` is `text`, `rectangular` or `circular`),
`ListItemSkeleton` (a row in a list) and `EmptyState` (loaded successfully,
nothing to show — **not** an error).

Match the skeleton's dimensions to the real content. A skeleton of a
different size causes the layout to jump.

```typescript
import {
  EmptyState,
  ErrorState,
  ListItemSkeleton,
  LoadingSkeleton,
} from '@/components/ui/feedback';

// A single line of text.
<LoadingSkeleton variant="text" width={220} />

// A block that replaces a card.
<LoadingSkeleton variant="rectangular" height={120} />

// An avatar or icon.
<LoadingSkeleton variant="circular" width={40} height={40} />

// Several lines at once.
<LoadingSkeleton count={4} />

// A list row.
<ListItemSkeleton />

// Loaded, but nothing to show.
<EmptyState
  title="Chưa có hồ sơ"
  message="Hồ sơ sẽ xuất hiện ở đây sau khi được duyệt."
  action={<Button size="small" variant="outlined">Tạo hồ sơ</Button>}
/>
```

`EmptyState` is not an error. A list that loaded with zero rows is a success
state.

The full-page spinner still has no place: a screen waiting for its first
block of data shows a skeleton, not a spinner.

## Spinners for mutations

A mutation does not change the layout — the button stays where it is and the
page keeps its content. A spinner belongs *in* the button, not in the page
body.

MUI v9's `Button` has a built-in `loading` prop that renders a
`CircularProgress` and disables the button, so a second submit cannot fire
while the first is in flight. `loadingPosition` controls where the indicator
sits — `'start'` keeps the label visible and pushes it right, `'center'`
replaces the label with the spinner.

Bind it to the **mutation's** pending flag, not a query's. `isPending` on a
query with `enabled: false` is `true` forever; a mutation that is disabled
has not fired at all, so `isPending` on it is the correct signal.

```typescript
import { Button, CircularProgress, IconButton } from '@mui/material';

// MUI v9 renders a CircularProgress and disables the button.
<Button variant="contained" loading={mutation.isPending}>
  Lưu
</Button>

// The label stays visible, the spinner pushes it right.
<Button variant="contained" loading={mutation.isPending} loadingPosition="start">
  Lưu
</Button>

// A small inline action.
<IconButton aria-label="Lưu" disabled={mutation.isPending}>
  {mutation.isPending ? <CircularProgress size={16} /> : <SaveIcon />}
</IconButton>
```

`loading` implies `disabled`, so a double submit is impossible while the
mutation is in flight.

In a **form**, the submit button uses the `FormSubmitButton` primitive,
which takes the mutation and binds `loading` to its `isPending` for you.
See `researchos-forms`.

```typescript
// Wrong — query.isPending can be true forever on a disabled query.
<Button loading={query.isPending}>Lưu</Button>

// Right — a mutation is either fired or not.
<Button loading={mutation.isPending}>Lưu</Button>
```

### Query flags vs mutation flags

| | Query | Mutation |
| --- | --- | --- |
| Pending flag | `isPending` — **true forever** on an `enabled: false` query | `isPending` — true only while the mutation runs |
| Correct binding | A skeleton, when the query is enabled | A button spinner |
| Never bind a spinner to | `query.isPending` on a disabled query | — |

A disabled mutation has not fired, so its `isPending` is the correct signal
for a button spinner. A disabled *query* has never resolved, so its
`isPending` is meaningless.

## Shared primitives

The shared feedback components live in `components/ui/feedback.tsx` and the
app-wide snackbar in `components/providers/snackbar-provider.tsx`. Use these
rather than hand-rolling an equivalent.

| Component | Use for |
| --- | --- |
| `LoadingSkeleton` | A block of content that is loading |
| `ListItemSkeleton` | A row in a list that is loading |
| `EmptyState` | Loaded successfully, nothing to show — **not** an error |
| `ErrorState` | A failed request or a failed action; always offer a way forward |
| `FieldError` | A validation message under one input |
| `useSnackbar()` | `showSnackbar({ severity, message })` — a transient notification |
| `FormTextField` | A text input bound to react-hook-form — see `researchos-forms` |
| `FormSelect` | A dropdown bound to react-hook-form — see `researchos-forms` |
| `FormCheckbox` | A toggle bound to react-hook-form — see `researchos-forms` |
| `FormSubmitButton` | The submit button, bound to the mutation's `isPending` — see `researchos-forms` |

## Mutation feedback

**Every mutation gives feedback.** A user who clicks a button and sees
nothing happen cannot tell whether the click registered. This is not
optional, and it applies to both outcomes.

| Outcome | Feedback |
| --- | --- |
| Success | A confirmation — the user knows it worked |
| Error | The server's message, shown where the user is looking |

### The rule

- **Success → snackbar.** The page is already correct at this point. A toast
  confirms and gets out of the way.
- **Error → inline, next to the thing that failed.** A toast is transient and
  disappears; an error that vanishes is an error the user will hit again.
  Put it where the user has to look — under the field, in the panel, in the
  form.

| Outcome | Where | How long |
| --- | --- | --- |
| Success | Snackbar | Auto-hides (~4s) |
| Error | Inline, next to what failed | Stays until resolved or dismissed |
| Validation error | Under each invalid input | Stays |
| Error with no local anchor | Snackbar, `autoHideDuration: null` | Stays until dismissed |

This is the asymmetry that matters: **success is a notification, failure is
a state.** A form that failed validation shows the errors under the inputs
and keeps the user on the page. A form that succeeded says so and moves on.

### Why the asymmetry

A snackbar is a notification channel, not a state channel. It auto-hides, it
is spatially detached from the cause, and it cannot hold per-field messages
legibly. An error the user did not read in four seconds is an error they
will repeat.

Success is different: the page is already correct, so a transient
confirmation is all that is needed.

```typescript
// Success — transient, confirms, dismisses itself.
const { showSnackbar } = useSnackbar();
const t = useTranslations('profile');
const tError = useTranslations('errors');

showSnackbar({ severity: 'success', message: t('saved') });

// Error — persistent, next to what failed, with a way forward.
<ErrorState
  title={t('saveFailedTitle')}
  message={resolveErrorCode(tError, apiErrorCode(mutation.error), tError('unknown'))}
  onRetry={() => void mutation.mutate(payload)}
/>
```

> **Every user-facing string comes from the message catalog.** The examples
> above use `t('…')` for the same reason the rest of the app does: the app
> has two locales, and a literal is one language forever. The
> `researchos-localization` skill owns the catalog and the mechanics;
> `researchos-ui` only decides *where* a message appears.

### Why not a snackbar for errors

A snackbar is a notification channel, not a state channel. It auto-hides, so
an error the user did not read in four seconds is an error they will repeat;
it is spatially detached from the cause, so an error under a field points at
the field while a toast in the corner points at nothing; and it cannot hold
per-field validation messages legibly. The backend groups those by field —
`apiFieldErrorCodes(error)` returns them — and a form needs one message
under each input.

The exception: an error with no local anchor — a background sync, a bulk
action, a failed logout — has nowhere to render inline. Then a snackbar with
`autoHideDuration: null` and a retry action is the right call.

### Field-level errors

`apiFieldErrorCodes(error)` returns the backend's grouped validation codes,
keyed by field. Resolve each code against the catalog, then render one
`FieldError` per field, under the input that caused it:

```typescript
import { useTranslations } from 'next-intl';
import { apiFieldErrorCodes } from '@/lib/api-error';
import { resolveFieldErrorCodes } from '@/utils/error-messages';
import { FieldError } from '@/components/ui/feedback';

const t = useTranslations('errors');
const fieldMessages = resolveFieldErrorCodes(
  t,
  apiFieldErrorCodes(mutation.error),
  t('unknown'),
);

{Object.entries(fieldMessages ?? {}).map(([field, message]) => (
  <FieldError key={field} id={`${field}-error`}>{message}</FieldError>
))}
```

`FieldError` renders a MUI `FormHelperText` in the error style. Pass an `id`
and reference it from the input's `aria-describedby` so a screen reader
announces the message with the field.

The backend groups by field precisely so each message can sit under its
input. Do not flatten them into one toast line.

Validation errors are inline, always: a `400` carries `errors` grouped by
field, so render each message under its input with `apiFieldErrorCodes(error)`
and the `FieldError` primitive. Never collapse them into one toast line.

**The wording lives in the catalog.** `errors[].messages` carries codes in
the target contract, so the constraint text is a catalog entry — one per
code, in both locales. The backend does not send codes yet, so today every
code resolves to the fallback; the code path does not change when it
switches. See the `researchos-localization` skill.

### Where to put the callbacks

In the mutation hook's `onSuccess` / `onError`, not in the click handler —
so the feedback fires however the mutation was triggered:

```typescript
const { showSnackbar } = useSnackbar();
const t = useTranslations('profile');
const tError = useTranslations('errors');

const mutation = useCreateProfile({
  onSuccess: () => {
    showSnackbar({ severity: 'success', message: t('created') });
  },
  onError: (error) => {
    setFieldErrors(
      resolveFieldErrorCodes(tError, apiFieldErrorCodes(error), tError('unknown')),
    );
  },
});
```

Do not derive the success message from a `useEffect` on `mutation.isSuccess`
— it fires twice under React Strict Mode.

### The snackbar provider

Do not hand-roll a `Snackbar`. The app already has one:
`components/providers/snackbar-provider.tsx`, mounted in
`app/[locale]/layout.tsx`.

```typescript
'use client';

import { useSnackbar } from '@/components/providers/snackbar-provider';
import { useTranslations } from 'next-intl';

const { showSnackbar } = useSnackbar();
const t = useTranslations('profile');

showSnackbar({ severity: 'success', message: t('saved') });
```

| Option | Note |
| --- | --- |
| `severity` | `'success' \| 'info' \| 'warning' \| 'error'` |
| `message` | Plain text. A translated string, never a literal |
| `autoHideDuration` | Defaults to 4000. `null` disables auto-hide — use it for an error |
| `actionLabel` + `onAction` | An optional recovery button inside the toast |

The provider handles the details the raw MUI component leaves to you:

- `role="status"` for a success (polite — it should not interrupt a screen
  reader) and `role="alert"` for an error (assertive).
- An **error never auto-hides** unless you pass an explicit
  `autoHideDuration`. A toast that vanishes after four seconds is a message
  many users never finish reading.
- `anchorOrigin` is bottom-right.

`useSnackbar()` **throws** outside a `SnackbarProvider` rather than silently
doing nothing. A missing provider is a wiring bug, and a silent no-op looks
like a snackbar that never appears.

If you need a raw `Snackbar` for a one-off, `SnackbarContent` defaults to
`role="alert"` — override it through the `content` slot:

```typescript
<Snackbar
  open={open}
  autoHideDuration={4000}
  onClose={handleClose}
  anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
  slotProps={{
    content: {
      role: 'status',
      sx: { bgcolor: 'success.main', color: 'success.contrastText' },
    },
  }}
  message={t('saved')}
/>
```
