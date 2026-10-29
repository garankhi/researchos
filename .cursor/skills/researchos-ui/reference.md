# ResearchOS UI — reference

Templates and lookup tables for `researchos-ui`. Read the section you need;
do not read this file end to end.

## Feature folder template

```text
apps/web/src/features/profiles/
  index.ts
  types.ts
  hooks/
    use-profile.ts
    use-profiles.ts
  components/
    profile-card.tsx
```

### `index.ts`

```typescript
/**
 * Profiles feature — public entry point.
 *
 * This barrel is the only import surface other modules should use.
 */

export { useProfile } from './hooks/use-profile';
export { useProfiles } from './hooks/use-profiles';
export type { Profile } from './types';
```

### `types.ts`

```typescript
/**
 * Domain types for the profiles feature.
 *
 * Derived from the generated API models but kept separate, so a backend field
 * rename surfaces here first.
 */

export interface Profile {
  id: string;
  displayName: string;
  createdAt: string;
}
```

### `hooks/use-profiles.ts` — list

```typescript
'use client';

import { useProfilesControllerFindAll } from '@/lib/api';
import type { Profile } from '../types';

export function useProfiles() {
  const query = useProfilesControllerFindAll();

  const data: Profile[] | undefined = query.data
    ? query.data.map((item) => ({
        id: item.id,
        displayName: item.displayName,
        createdAt: item.createdAt,
      }))
    : undefined;

  return {
    ...query,
    data,
    isLoaded: query.isSuccess,
    isFetching: query.isFetching,
    isFailed: query.isError,
  };
}
```

### `hooks/use-profile.ts` — detail

```typescript
'use client';

import { useProfilesControllerFindOne } from '@/lib/api';
import type { Profile } from '../types';

export function useProfile(id: string) {
  const query = useProfilesControllerFindOne(id, {
    query: { enabled: Boolean(id) },
  });

  const data: Profile | undefined = query.data
    ? {
        id: query.data.id,
        displayName: query.data.displayName,
        createdAt: query.data.createdAt,
      }
    : undefined;

  return {
    ...query,
    data,
    isLoaded: query.isSuccess && data !== undefined,
    isFetching: query.isFetching,
    isFailed: query.isError,
  };
}
```

## Query state cheat sheet

| Situation | Flag | Why |
| --- | --- | --- |
| Request in flight | `isFetching` | True only while a request is active |
| Enabled query, never resolved | `isPending` | True until the first data arrives |
| Disabled query, never called | `isPending` | **Stays true forever** — never bind a spinner to this |
| Last attempt succeeded | `isSuccess` | Data is available |
| Last attempt failed | `isError` | Render an error state |
| Refetching with data already present | `isRefetching` | Keep showing data, add a subtle indicator |

For a query with `enabled: false`, use `isFetching` to detect a manual
`refetch()` and `isSuccess` / `isError` to detect a completed attempt.

## Loading primitives

Skeletons for block loading:

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

## Mutation indicators

A spinner belongs in the button that triggered the mutation.

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

### Query flags vs mutation flags

| | Query | Mutation |
| --- | --- | --- |
| Pending flag | `isPending` — **true forever** on an `enabled: false` query | `isPending` — true only while the mutation runs |
| Correct binding | A skeleton, when the query is enabled | A button spinner |
| Never bind a spinner to | `query.isPending` on a disabled query | — |

A disabled mutation has not fired, so its `isPending` is the correct signal
for a button spinner. A disabled *query* has never resolved, so its
`isPending` is meaningless.

```typescript
// Wrong — query.isPending can be true forever on a disabled query.
<Button loading={query.isPending}>Lưu</Button>

// Right — a mutation is either fired or not.
<Button loading={mutation.isPending}>Lưu</Button>
```

## Mutation feedback

Success → snackbar. Error → inline, next to the cause.

| Outcome | Where | How long |
| --- | --- | --- |
| Success | Snackbar | Auto-hides (~4s) |
| Error | Inline, next to what failed | Stays until resolved or dismissed |
| Validation error | Under each invalid input | Stays |
| Error with no local anchor | Snackbar, `autoHideDuration: null` | Stays until dismissed |

### Why the asymmetry

A snackbar is a notification channel, not a state channel. It auto-hides, it
is spatially detached from the cause, and it cannot hold per-field messages
legibly. An error the user did not read in four seconds is an error they
will repeat.

Success is different: the page is already correct, so a transient
confirmation is all that is needed.

### MUI Snackbar details

`SnackbarContent` defaults to `role="alert"`. That is right for an error but
wrong for a success — a success should not interrupt a screen reader.
Override it through the `content` slot:

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
  message="Đã lưu hồ sơ."
/>
```

| Prop | Note |
| --- | --- |
| `role` | `'alert'` for errors (assertive), `'status'` for success (polite) |
| `autoHideDuration` | `null` disables auto-hide — use it for errors |
| `anchorOrigin` | Defaults to bottom-left; bottom-right is the common choice |
| `message` | Plain text. For rich content, pass a child instead |
| `key` | Give each message a distinct key so consecutive toasts do not merge |

### Field-level errors

`apiFieldErrors(error)` returns the backend's grouped validation messages:

```typescript
import { apiErrorMessage, apiFieldErrors } from '@/lib/api-error';

const fieldErrors = apiFieldErrors(mutation.error);

{fieldErrors?.map((e) => (
  <FieldError key={e.field} message={e.messages.join(', ')} />
))}
```

The backend groups by field precisely so each message can sit under its
input. Do not flatten them into one toast line.

### Where to put the callbacks

In the mutation hook's `onSuccess` / `onError`, not in the click handler —
so the feedback fires however the mutation was triggered:

```typescript
const mutation = useCreateProfile({
  onSuccess: () => {
    showSnackbar({ severity: 'success', message: 'Đã tạo hồ sơ.' });
  },
  onError: (error) => {
    setFieldErrors(apiFieldErrors(error));
  },
});
```

Do not derive the success message from a `useEffect` on `mutation.isSuccess`
— it fires twice under React Strict Mode.

## Error patterns

### Component level

```typescript
<ErrorState
  title="Không tải được danh sách hồ sơ"
  message="Máy chủ không phản hồi. Thử lại sau."
  onRetry={() => void refetch()}
/>
```

### Boundary around one widget

```typescript
import ErrorBoundary from '@/components/ui/error-boundary';

<ErrorBoundary title="Lỗi ở cấp component">
  <ExpensiveChart />
</ErrorBoundary>
```

### Route level — `app/<segment>/error.tsx`

```typescript
'use client';

import { useEffect } from 'react';
import { Box, Button, Container, Stack, Typography } from '@mui/material';

export default function SegmentError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Stack spacing={2} role="alert" sx={{ alignItems: 'center', textAlign: 'center' }}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 500 }}>
          Đã xảy ra lỗi khi tải trang
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Lỗi tạm thời. Vui lòng thử lại.
        </Typography>
        <Box>
          <Button variant="contained" onClick={() => retry()}>
            Thử lại
          </Button>
        </Box>
      </Stack>
    </Container>
  );
}
```

Two rules: the props are `error` and `retry` (not `reset`), and `error` is
`unknown` — narrow it before reading `.message`.

Do not export the component as `Error`. It shadows the global `Error`
constructor inside that module and breaks `instanceof` checks there.

### Global — `app/global-error.tsx`

Replaces the root layout, so it must render its own `<html>` and `<body>`.

```typescript
'use client';

export default function GlobalError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <h2>Ứng dụng gặp lỗi</h2>
        <button onClick={() => retry()}>Thử lại</button>
      </body>
    </html>
  );
}
```

Next.js 16.4 passes both `reset` and `retry` to an error boundary. `retry`
re-renders the failed segment; `reset` clears the boundary state. Use `retry`
for a "try again" action, matching `app/error.tsx`.

The global boundary replaces the root layout, so it does not inherit the
providers, the theme, or the `dark` class on `<html>`. Style it standalone
rather than assuming the app shell is present.

### Access boundaries

Each interrupt function gets a route that calls it during a server render.

```typescript
// app/profiles/forbidden/page.tsx
import { forbidden } from 'next/navigation';

export default function ForbiddenPage() {
  forbidden();
}
```

```typescript
// app/profiles/unauthorized/page.tsx
import { unauthorized } from 'next/navigation';

export default function UnauthorizedPage() {
  unauthorized();
}
```

```typescript
// app/profiles/not-found/page.tsx
import { notFound } from 'next/navigation';

export default function NotFoundPage() {
  notFound();
}
```

`forbidden()` and `unauthorized()` need `experimental.authInterrupts: true` in
`next.config.ts`. Without it the build fails.

## Next.js route conventions

| File | Scope | Purpose |
| --- | --- | --- |
| `app/layout.tsx` | Segment and children | Shared chrome and providers |
| `app/page.tsx` | Segment | The route UI |
| `app/loading.tsx` | Segment and children | Suspense fallback |
| `app/error.tsx` | Segment and children | Error boundary for the segment |
| `app/global-error.tsx` | Root | Last-resort boundary |
| `app/not-found.tsx` | Root | `notFound()` UI |
| `app/unauthorized.tsx` | Root | `unauthorized()` UI |
| `app/forbidden.tsx` | Root | `forbidden()` UI |
| `app/template.tsx` | Segment | Remounts on navigation |
| `app/_components/` | Segment | Components used only there |

`error.tsx` does **not** wrap the `layout.tsx` or `template.tsx` above it in
the same segment. A root-layout failure needs `global-error.tsx`.

## Suspense and request-time rendering

With Cache Components enabled, a page that must render per request calls
`await io()` from `next/cache` before reading request-time values, and wraps
the component in `<Suspense>` so the fallback ships in the static shell.

```typescript
import { io } from 'next/cache';

async function CurrentTime() {
  await io();
  return <p>{new Date().toISOString()}</p>;
}
```

A route that always throws at render time needs `await connection()` from
`next/server` first, or the throw happens during `next build` and the build
fails instead of the error boundary rendering at runtime.

## MUI notes

### Layout props go through `sx`

```typescript
// MUI v9 removed these from the direct prop surface.
<Stack alignItems="center" gap={2} textAlign="center" fontWeight={500}>
  <Box gap={1} flex={1} py={2} px={3} />

// Correct.
<Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center' }}>
  <Box sx={{ gap: 1, flex: 1, py: 2, px: 3 }} />
  <Typography sx={{ fontWeight: 500 }}>Tiêu đề</Typography>
</Stack>
```

`align` on `Typography` still works as a prop. `textAlign` does not — it goes
through `sx`. `spacing` on `Stack` still works as a prop.

### Import style

```typescript
// Preferred — tree-shakeable.
import Button from '@mui/material/Button';

// Also valid.
import { Button } from '@mui/material';
```

### Link wrapper

```typescript
import NextLink from '@/components/ui/link';

<Button component={NextLink} href="/profiles">Hồ sơ</Button>
```

`as={Link}` does not work — use `component`.

## Tailwind and MUI together

```typescript
// Tailwind utility wins: `utilities` layer sits above `mui`.
<Box className="bg-amber-500 p-4" sx={{ backgroundColor: 'primary.main' }} />
```

To verify the cascade at runtime, compare computed values rather than
expecting a specific string — the browser may serialise the same colour
differently depending on how it was authored (`lab(...)` versus `rgb(...)`).

```typescript
const element = boxRef.current;
const computed = window.getComputedStyle(element).backgroundColor;
```

## Commands

```powershell
# Verify
pnpm --filter web lint
pnpm --filter web build
pnpm build && pnpm lint && pnpm test
```

Regenerating the API client is a backend-side step — see the
`researchos-api-endpoint` skill.

## Orval: query hooks vs mutation hooks

Orval decides per operation whether to emit a **query** hook or a **mutation**
hook, based on the HTTP verb and the `override.query.useQuery` /
`override.query.useMutation` flags.

| Config | `GET` | `POST` / `PATCH` / `DELETE` |
| --- | --- | --- |
| Default (no `override.query`) | `useQuery` hook | `useMutation` hook |
| `override.query.useQuery: true` | `useQuery` hook | **`useQuery` hook** |

Verified by generating the same spec both ways. With `useQuery: true`, a
`POST` operation is emitted as a query hook: the cache key is
`["POST", "/profiles", body]`, the hook is backed by `useQuery`, and there is
no `mutate`, no `mutateAsync`, and no `onSuccess` / `onError` mutation
callback.

That is wrong for a write. A `POST` behind a query hook **caches the
response**, re-runs the request when the query key is invalidated, and gives
the caller no mutation handle.

`useQuery: true` was set when the client was first added (commit `9125889`),
when the project only had `GET` endpoints. It was harmless then — for the
current spec it makes **no difference at all**, and the generated output is
byte-identical with and without it.

### The fix

Delete the blanket `useQuery: true` from `apps/web/orval.config.ts` and let
Orval decide by verb:

```typescript
override: {
  mutator: {
    path: './src/lib/axios-instance.ts',
    name: 'axiosInstance',
  },
  query: {
    signal: true,
  },
},
```

`signal: true` stays — it makes the request cancellable via the `AbortSignal`
that React Query passes to the query function.

`useQuery: true` should only ever be scoped to individual operations, never
set globally.

### Verifying the change

Regenerating must produce **no diff** while the project has only `GET`
endpoints:

```powershell
pnpm --filter web orval
git diff --stat apps/web/src/lib/api
```

A diff on `GET` operations means something else changed. A diff that shows
`useMutation` appearing is the expected result once a `POST` exists.

### Version detection

Orval reads `package.json` to decide which React Query version's option
types to emit. It cannot always find it — when it cannot, it falls back to
v4 shapes and warns:

```text
Could not determine the installed @tanstack/react-query version, so hooks are
generated for v4. If the project is on v5, set `override.query.version: 5`
(or point `output.packageJson` at the package.json that declares the
dependency)
```

The v4 shapes are wrong for this project: they omit the `Partial<>` wrapper
around the options object, so the generated option types do not accept a
partial `query` object. This project is on `@tanstack/react-query@5.105.0`,
so the generated code must use `Partial<UseQueryOptions<...>>`.

If the warning appears during a normal `pnpm --filter web orval` run, the
config is fine — it resolves `package.json` from the config's own directory.
The warning only shows up when Orval is run from elsewhere, or when the
config's `packageJson` is not set.

## Common mistakes

| Mistake | Consequence |
| --- | --- |
| Spinner bound to `isPending` on an `enabled: false` query | Spinner never stops; button can never be clicked |
| `loading={query.isPending}` on a submit button | Same trap, on the button this time — bind the mutation's flag |
| A page-level spinner while a block of content loads | The layout jumps when the data arrives; use a skeleton |
| A mutation with no success feedback | The user cannot tell the click registered |
| A mutation with no error feedback | The user retries blindly against a failure they never saw |
| A snackbar for an error that has a local anchor | The message auto-hides and points at nothing |
| Validation errors flattened into one toast line | Defeats the backend's per-field grouping; the user cannot tell which input is wrong |
| A success message derived from a `useEffect` on `isSuccess` | Fires twice under React Strict Mode |
| `override.query.useQuery: true` set globally in the Orval config | `POST`/`PATCH`/`DELETE` are generated as query hooks — cached, no `mutate`, no `onSuccess`/`onError` |
| Hand-written file under `src/lib/api/` | Deleted on the next Orval run (`clean: true`) |
| Deep import `@/lib/api/profiles/profiles` | Blocked by eslint; import from `@/lib/api` |
| Value import from `@/lib/api/models` | Blocked by eslint; a *type-only* import is allowed |
| Relative import `../../lib/api/profiles/profiles` | **Passes lint** — the rule only matches the `@/` alias, and `clean: true` still deletes the file |
| Reading `query.data.data` | The mutator already unwrapped the envelope |
| `String(error)` in an error state | Shows `"AxiosError: Request failed with status code 500"` instead of the server's message |
| UI branching on raw query flags | Every screen repeats the state logic and its bugs |
| Feature importing another feature's files | Coupling; call the other feature's hook instead |
| `components/ui/` naming a domain entity | Breaks the shared-primitive boundary |
| MUI system props passed directly | Invalid HTML attributes leak onto the DOM |
| `component={Link}` with `next/link` | "Functions cannot be passed directly to Client Components" |
| Reading the theme during render | Hydration mismatch |
| Exporting a component as `Error` | Shadows the global `Error`; breaks `instanceof` |
| `notFound()` in a click handler | It throws during a server render only — use a dedicated route |
| `forbidden()` without `authInterrupts` | Build fails |
