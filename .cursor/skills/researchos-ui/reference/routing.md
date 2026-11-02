# Routing and error boundaries

Error states at each level — component, segment, route — and the Next.js
file conventions behind them.

## Error states

### In a component

Use `ErrorState` from `components/ui/feedback.tsx`. Every error state offers a
way forward — a dead-end message with no recovery action is a bug.

```typescript
<ErrorState
  title={t('loadFailedTitle')}
  message={t('loadFailedDescription')}
  onRetry={() => void refetch()}
/>
```

### At component level

`components/ui/error-boundary.tsx` wraps `catchError` from `next/error`. Use
it when one widget can fail without taking the page down.

```typescript
<ErrorBoundary title="Lỗi ở cấp component">
  <SomeWidget />
</ErrorBoundary>
```

`catchError` is preferred over a hand-rolled React error boundary class: it
re-renders inside a Transition so surrounding client state survives, it lets
`redirect()` and `notFound()` pass through instead of swallowing them, and it
clears the error on client navigation.

### At route level

Next.js file conventions:

| File | Catches |
| --- | --- |
| `app/error.tsx` | Uncaught errors in that segment and its children. Props: `error`, `retry()` |
| `app/global-error.tsx` | Failure in the root layout. Renders its own `<html>` and `<body>` |
| `app/loading.tsx` | Suspense fallback while the segment resolves |
| `app/not-found.tsx` | `notFound()` |
| `app/unauthorized.tsx` | `unauthorized()` — needs `experimental.authInterrupts` |
| `app/forbidden.tsx` | `forbidden()` — needs `experimental.authInterrupts` |

Scope an `error.tsx` to the narrowest segment that owns the failure. A crash
in one feature should not take down the whole app.

`notFound()`, `unauthorized()` and `forbidden()` work by throwing during a
server render, so they cannot be called from a click handler. Give each one a
dedicated route that calls it. The backend enforces permission; the frontend
only reflects it — the route decides, the boundary renders.

In `error.tsx`, `error` is typed `unknown` — narrow it with `instanceof Error`
before reading `.message`. Do not name the component `Error`: a default export
named `Error` shadows the global constructor and breaks `instanceof` checks
inside that module.

Next.js 16.4 passes both `reset` and `retry` to an error boundary. `retry`
re-renders the failed segment and is what a "try again" button should call;
`reset` clears the boundary state. `app/error.tsx` uses `retry`.

## Route templates

### Segment — `app/<segment>/error.tsx`

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
