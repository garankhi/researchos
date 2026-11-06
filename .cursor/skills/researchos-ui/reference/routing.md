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

### The auth gate

Every route in `app/[locale]/` sits behind a gate. An unauthenticated
visitor is sent to the login screen instead of the page they asked for.

```typescript
// app/[locale]/layout.tsx
<AuthGate>{children}</AuthGate>
```

| File | Role |
| --- | --- |
| `features/identity/utils/auth-gate.ts` | The **pure** rules — public routes, the decision. Testable without a browser or a session |
| `features/identity/components/auth-gate.tsx` | The component that applies them |
| `features/identity/utils/return-to.ts` | `buildLoginHref()` — the sanitized `returnTo` link |

The gate is in **one** place — the `[locale]` layout — so a new route is
protected by default rather than by remembering to protect it. Do not add
a second gate, and do not gate a route by hand.

#### The two public routes

```typescript
export const PUBLIC_ROUTE_PREFIXES = ['/login', '/'] as const;
```

- `/login` — the sign-in screen. Gating it would loop: the gate would
  send the visitor to the login screen, which is where they already are.
- `/` — the home screen. It is the landing page, and it answers the
  "who am I?" question itself: a signed-out visitor sees a sign-in
  button instead of being thrown away. Gating it would leave a visitor
  who followed a shared link with nothing but a login form and no
  explanation of what they were trying to reach.

Note that `/` matches **only** the root: the match is on a path segment
boundary, so `/` does not swallow `/demo`. A prefix matches itself and
everything below it (`/login/…`), never a longer word that happens to
start with the same letters — `/login` never matches `/logins`.

The pathname the gate reads is the **locale-free** one (`/login`, not
`/vi/login`), because the locale is a routing concern.

#### The two decisions

```typescript
export type GateDecision = 'render' | 'redirect';
```

1. **A public route always renders.** The login screen must not be
   redirected to itself, and the home screen must not bounce a visitor
   away before it has shown them anything.
2. **A signed-out visitor is redirected** to `/login?returnTo=…`.

There is deliberately **no** "wait" decision, and there is no fourth case
for "the API is down". A failed request is not the same as not being
signed in, and redirecting to the login screen because the API is
unreachable would send the visitor into a loop they cannot get out of.
The page renders instead, and its own error state explains what went
wrong.

#### Why the gate never holds the page back

An earlier version replaced the page with a skeleton until the session
check came back. That cannot work here, and the reason only shows up
under `cacheComponents`: **the session check never resolves on the
server.** `GET /me` is a browser request — the server has no answer to
give, so the server always rendered the "still checking" branch.

Two things followed, and both were bad:

- the server shipped a skeleton instead of the page, so the real content
  only ever existed in the client payload — and Next.js dropped the
  segment from the server shell entirely (`Route "/[locale]/demo": Could
  not validate that a segment in your UI has instant navigation. This
  segment was dropped from rendering.`);
- every protected page cost a round trip before it could show anything,
  which is the same round trip the header was already making.

So the gate **renders the page and redirects the moment the answer says
"no session"**. A signed-out visitor sees the page shell for a moment and
is then sent to the login screen — which is what a redirect is.

**The consequence for protected data:** because the server renders the
page before it knows who is asking, a page must not fetch **protected**
data on the server. That data belongs to a client-side query, where the
browser sends the session cookie and the backend can answer `401` for a
request it should refuse. A server component that reads a protected row
would put that row in the HTML for everybody.

#### `useMe`, not `useSession`

`useSession().isSignedOut` means "there is no account **and** the check
has finished", which is also true when the API is down. `useMe().isSignedOut`
is the strict reading — **the API answered `401`** — so the gate only
redirects when the backend really said "not signed in".

#### Why it is client-side

The session rides an opaque `httpOnly` cookie. The browser holds it and
JavaScript cannot read it, so a server-side check is only possible when
the web app and the API share one origin. They are separate origins in
development (`localhost:3000` and `localhost:4000`) and sit behind a
reverse proxy in production, and the deployment does not pin the cookie's
`Domain` attribute. A proxy-level gate that reads the cookie would be a
**redirect loop** in every topology where the cookie is scoped to the API
host.

The backend remains the authority. The gate does not decide who may read
what; it only decides whether to show a screen to someone the backend
would refuse to answer anyway.

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

The two interrupts mirror the backend's guards, one for one:

| Backend | Answer | Frontend |
| --- | --- | --- |
| `SessionGuard` → `401` | There is no valid session | `unauthorized()` |
| `RoleGuard` → `403` | Signed in, but not allowed | `forbidden()` |

The backend decides which one applies — the route only renders the
boundary. See the `researchos-api-endpoint` skill for the guards.

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
