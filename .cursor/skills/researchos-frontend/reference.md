# ResearchOS frontend — reference

Templates and lookup tables for `researchos-frontend`. Read the section you
need; do not read this file end to end.

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
# Regenerate the API client after a backend contract change
pnpm --filter api openapi
pnpm --filter web orval
pnpm codegen

# Verify
pnpm --filter web lint
pnpm --filter web build
pnpm build && pnpm lint && pnpm test
```

## Common mistakes

| Mistake | Consequence |
| --- | --- |
| Spinner bound to `isPending` on an `enabled: false` query | Spinner never stops; button can never be clicked |
| Hand-written file under `src/lib/api/` | Deleted on the next Orval run (`clean: true`) |
| Deep import `@/lib/api/profiles/profiles` | Blocked by eslint; import from `@/lib/api` |
| Reading `query.data.data` | The mutator already unwrapped the envelope |
| `String(error)` in an error state | Shows `"AxiosError: Request failed with status code 500"` instead of the server's message |
| Building `{ success, data }` in a controller | Double-wrapped — the interceptor does it |
| UI branching on raw query flags | Every screen repeats the state logic and its bugs |
| Feature importing another feature's files | Coupling; call the other feature's hook instead |
| `components/ui/` naming a domain entity | Breaks the shared-primitive boundary |
| MUI system props passed directly | Invalid HTML attributes leak onto the DOM |
| `component={Link}` with `next/link` | "Functions cannot be passed directly to Client Components" |
| Reading the theme during render | Hydration mismatch |
| Exporting a component as `Error` | Shadows the global `Error`; breaks `instanceof` |
| `notFound()` in a click handler | It throws during a server render only — use a dedicated route |
| `forbidden()` without `authInterrupts` | Build fails |
