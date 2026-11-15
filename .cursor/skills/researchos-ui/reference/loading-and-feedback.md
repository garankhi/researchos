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

The full-page spinner still has no place: a screen waiting for its first
block of data shows a skeleton, not a spinner.

## Skeletons that match the layout

The app renders **Boneyard** skeletons (`boneyard-js`). A skeleton is not a
generic grey rectangle — it is a set of bones positioned to match the real
content, so the space is already reserved when the data arrives.

### The primitive: `DelayedSkeleton`

`src/components/ui/delayed-skeleton.tsx` is the shared primitive. It wraps
Boneyard's `<Skeleton>` and adds the two behaviours the app needs:

```tsx
import { DelayedSkeleton } from '@/components/ui/delayed-skeleton';

<DelayedSkeleton layout={headerLayout} />
```

| Prop | Default | Effect |
| --- | --- | --- |
| `layout` | required | A Boneyard `SkeletonResult` — the bones to draw |
| `announce` | `true` | Renders a `VisuallyHidden role="status"` with `common.loading` |

Two behaviours are built in:

- **The space is reserved immediately.** The wrapper renders a box of the
  layout's `width` and `height` on the first paint, and the bones are drawn
  200 ms later (`SKELETON_DELAY_MS`). A fast response never flashes a
  skeleton; a slow one still holds its space from the start.
- **The bones are `aria-hidden`.** The visible skeleton carries no text; the
  announcement is a separate live region.

Use `DelayedSkeleton` for every block and route skeleton. There is no
generic rectangle primitive — a skeleton is always an authored
`SkeletonResult` that matches the content it replaces.

### Authoring a `SkeletonResult`

A `SkeletonResult` is a plain object. Author it in the module's **skeleton
file**, next to the feature folder that owns the screen.

```text
apps/web/src/features/profiles/
  components/
    profile-skeletons.tsx   The layouts and the components that draw them
```

**One skeleton file per module.** The layouts and the components that draw
them live together, so the whole screen's skeleton geometry and markup can
be read — and corrected — in one place:

```tsx
// features/profiles/components/profile-skeletons.tsx
import type { SkeletonResult } from 'boneyard-js';

/** The avatar beside the header, on mobile. */
const mobileAvatar: SkeletonResult = {
  name: 'profile-avatar-mobile',
  viewportWidth: 390,
  width: 80,
  height: 80,
  bones: [[0, 0, 100, 80, 0]],
};
```

| Field | Meaning |
| --- | --- |
| `name` | Unique identifier. Also the `data-boneyard` hook a Storybook test queries |
| `viewportWidth` | The viewport the layout was authored for |
| `width` / `height` | The box the skeleton reserves |
| `bones` | Each bone is `[x, y, w, h, r]` — x and y are percentages of the box, w and h are percentages of the width and height, `r` is the corner radius |

Bone coordinates are **percentages**, not pixels: `w: 100` means the full
width of the box. The `r` value is a radius — use `0` for a square bone and
`'50%'` for a circle.

**The naming convention:** the file is `<module>-skeletons.tsx` and the
layouts are named after the region they mirror — `mobileAvatar`,
`sessionSummary`, `apiStatus`. A layout is module-private unless a route
outside the module needs it; then it is exported and re-exported from the
module's barrel.

The **skeleton component** wraps the layout, so a consumer never touches
`DelayedSkeleton` directly:

```tsx
// features/identity/components/identity-skeletons.tsx
export function LoginFormSkeleton() {
  return <DelayedSkeleton layout={loginForm} />;
}
```

```tsx
// app/[locale]/login/page.tsx
import { LoginForm, LoginFormSkeleton } from '@/features/identity';

<Suspense fallback={<LoginFormSkeleton />}>
```

### One layout per breakpoint

A region that lays out differently on mobile and desktop needs **two**
layouts, swapped with Chakra's `hideFrom` / `hideBelow`:

```tsx
<Box hideFrom="sm" w="20" flexShrink="0">
  <DelayedSkeleton layout={mobileAvatar} announce={false} />
</Box>
<Box hideBelow="sm" w="25" flexShrink="0">
  <DelayedSkeleton layout={desktopAvatar} announce={false} />
</Box>
```

One layout sized for the wrong viewport reserves the wrong space, and the
page jumps when the real content arrives.

### Announcing the loading state

`DelayedSkeleton` renders `role="status"` with the translated `common.loading`
string by default. **One announcement per region** — every decorative bone
inside that region passes `announce={false}`:

```tsx
// The header announces once; the avatar and the meta lines are decorative.
<DelayedSkeleton layout={mobileHeaderDetails} announce />
<DelayedSkeleton layout={mobileAvatar} announce={false} />
```

Several announcements firing at once make a screen reader read them all out
before the content.

The announcement string comes from the message catalog, so it is translated
like any other string. See `researchos-localization`.

### A skeleton belongs to the feature

A skeleton that mirrors a domain layout is a **domain** concern, so it lives
in the feature's `components/` folder next to the real component, and is
exported from the feature barrel.

```text
features/profiles/components/
  profile-skeletons.tsx   The layouts and the components that draw them
```

```tsx
// features/profiles/components/profile-skeletons.tsx
export function ProfileHeaderSkeleton({ announce = true }: { announce?: boolean }) { … }
export function ProfileTabSkeleton({ tab, isOwner }: { tab: ProfileTab; isOwner?: boolean }) { … }
```

The layouts and the components that draw them live in **one file per
module**. Splitting them into a separate `-skeleton-layouts.ts` doubles the
files for no gain: the layouts are only meaningful next to the markup that
draws them, and a reader looking at one screen's skeleton has to open both
files to see it.

`components/ui/` stays domain-free — `DelayedSkeleton` and the app shell's
`RouteLoadingSkeleton` live there, the profile-shaped ones do not. The eslint
rule `researchos/no-domain-entities-in-ui` enforces the boundary.

### A route's skeleton belongs to the module that owns the screen

A route that renders a domain screen imports its skeleton from that
module's barrel, so the layout lives with the feature instead of being
copied into the route:

```tsx
// app/[locale]/profile/my-profile/page.tsx
import { ProfilePageSkeleton, ProfileShell } from '@/features/profiles';

<Suspense fallback={<ProfilePageSkeleton />}>
```

A route that is not domain-specific — the app shell's `loading.tsx` — uses
the shared `RouteLoadingSkeleton` from `components/ui/delayed-skeleton.tsx`.

### As a Suspense fallback

A route skeleton is the same primitive, wrapped in a `Suspense` fallback:

```tsx
export default function ProfilePage(props: ProfilePageProps) {
  return (
    <Suspense fallback={<ProfilePageSkeleton />}>
      <ProfileContent {...props} />
    </Suspense>
  );
}
```

The fallback is a **component**, not inline markup — the layout is defined
once, in the feature, and the route just references it.

## Initial fetch versus refetch

A skeleton covers the **initial fetch** — the first load, when there is
nothing to show yet. Once data has arrived, it stays on screen through a
refetch; the request settles behind it.

```tsx
// Right — the skeleton only stands in for data that does not exist yet.
{profile ? (
  <ProfileHeader profile={profile} isOwner={isOwner} onEdit={onEdit} />
) : (
  <ProfileHeaderSkeleton announce={false} />
)}
```

Blanking a screen the user is already reading looks like a crash. Branch on
whether usable data exists, not on the request being in flight.

The same rule applies to the outcome: the empty or error state appears as
soon as the request settles. A skeleton must never mask it.

```tsx
if (isLoading) return <ProfileTabSkeleton tab={activeTab} isOwner={isOwner} />;
if (isFailed) return <ErrorState … />;
// data present, or empty → EmptyState
```

### Keep the chrome alive

While the content loads, the surrounding chrome stays. The tab list, the
navigation and the controls around a loading region remain usable — the
skeleton replaces the *content*, not the page.

```tsx
// The tabs render above the skeleton; the user can switch tabs while one loads.
<Tabs.Root value={activeTab} onValueChange={…}>
  …
  {renderContent()}
</Tabs.Root>
```

## Spinners for mutations

A mutation does not change the layout — the button stays where it is and the
page keeps its content. A spinner belongs *in* the button, not in the page
body.

Chakra's `Button` uses `loading` and optional `loadingText`. Bind it to the
mutation's pending flag to show the spinner and prevent another submit.

```tsx
import { Button } from '@chakra-ui/react';

<Button loading={mutation.isPending} loadingText={t('loading')}>
  {t('save')}
</Button>
```

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
| `DelayedSkeleton` | The primitive — draws one Boneyard layout. A module wraps it in its own skeleton component; see [Skeletons that match the layout](#skeletons-that-match-the-layout) |
| `RouteLoadingSkeleton` | The app shell's route fallback, for a route that is not domain-specific |
| `EmptyState` | Loaded successfully, nothing to show — **not** an error |
| `ErrorState` | A failed request or a failed action; always offer a way forward |
| `FieldError` | A validation message under one input |
| `useSnackbar()` | `showSnackbar({ severity, message })` — a transient notification |
| `FormTextField` | A text input bound to react-hook-form — see `researchos-forms` |
| `FormSelect` | A dropdown bound to react-hook-form — see `researchos-forms` |
| `FormCheckbox` | A toggle bound to react-hook-form — see `researchos-forms` |
| `FormSubmitButton` | The submit button, bound to the mutation's `isPending` — see `researchos-forms` |

### Testing a skeleton in Storybook

A skeleton's behaviour is not visible in a static snapshot: it reserves
space, delays the bones and announces once. Give it a play function.

```tsx
play: async ({ canvas, canvasElement }) => {
  // The announcement appears when the bones are drawn.
  await canvas.findByRole('status');

  await waitFor(() => {
    expect(canvasElement.querySelectorAll('[data-boneyard-bone]')).toHaveLength(3);
  });

  // Exactly one announcement per region.
  await expect(canvas.getAllByRole('status')).toHaveLength(1);
});
```

`[data-boneyard="<name>"]` selects a specific skeleton by the `name` in its
`SkeletonResult`. Assert the **geometry** between two bones — the gap
between an avatar and the details beside it is what proves the layout
matches:

```tsx
expect(details.getBoundingClientRect().left - avatar.getBoundingClientRect().right)
  .toBeCloseTo(24, 0);
```

Test the fast path too: a response that settles inside the 200 ms delay must
never announce a loading state. Watch the live region with a
`MutationObserver` and assert that nothing was announced.

Run `pnpm --filter web test:storybook` when a story or an interaction it
covers changes.

`EmptyState` is not an error. A list that loaded with zero rows is a success
state.

```typescript
import { EmptyState, ErrorState } from '@/components/ui/feedback';

// Loaded, but nothing to show.
<EmptyState
  title="Chưa có hồ sơ"
  message="Hồ sơ sẽ xuất hiện ở đây sau khi được duyệt."
  action={<Button size="small" variant="outlined">Tạo hồ sơ</Button>}
/>
```


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

`FieldError` renders a translated message in the Chakra error color. Pass an `id`
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

### When the callback must survive an unmount

A hook-level `onSuccess` / `onError` runs whenever the mutation was
triggered. A **per-call** callback — the second argument of `mutate()` —
runs only if the observer still has listeners when the mutation settles.

That matters when the mutation's cleanup unmounts the caller: clearing a
Zustand store that holds the account removes the account menu, which
unsubscribes the observer, and the per-call callback is silently dropped. A
redirect placed there never happens.

```typescript
// Wrong — the redirect never runs, because clearUser() unmounts the caller.
logout.mutate(undefined, { onSuccess: () => router.replace('/') });

// Right — the promise continuation is not owned by the component.
logout
  .mutateAsync(undefined)
  .then(() => router.replace('/'));
```

Full explanation: [client-state.md](client-state.md#clearing-a-store-from-a-mutation--the-unmount-trap).

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

The provider uses Chakra's portaled toaster at the bottom end, with polite
status announcements for confirmations and an alert for errors. Errors stay
visible until dismissed unless you set a duration. Use `SnackbarProvider`
near the app root or as a Storybook decorator for stories that need toasts.
