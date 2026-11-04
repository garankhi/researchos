# Client state (Zustand)

The app has two kinds of state, and they are not interchangeable. This file
says which is which, where a Zustand store lives, and the rules that keep the
two from fighting each other.

## The split

| | Server state | Client state |
| --- | --- | --- |
| Owner | **TanStack Query** | **Zustand** |
| Lives in | the query cache | a store under `features/<domain>/store/` |
| Source of truth | the API | the client itself |
| Lifetime | until the cache entry is removed | until the page is closed |
| Read with | `useSomeQuery()` | `useSomeStore((state) => …)` |
| Survives a reload | only if the cache is persisted | only if the store is persisted |

The rule of thumb: **if the value came from the API, it belongs in the query
cache.** A store that holds a copy of server data is a second source of truth
for the same fact, and the two drift apart the moment one of them is
refreshed.

Zustand is for state the API does not own: the current session as the chrome
needs to see it, a UI preference, a wizard's draft, an open-panel flag.

## When a store is justified

A store earns its place when a value has to be readable **synchronously, on
the first render**, by more than one component, and it is not worth a network
round-trip of its own.

The session is the worked example. `GET /me` already lives in the query
cache, but the header and the account menu need the account *immediately*:

- on a hard reload the query cache is empty, so a component reading it
  renders "signed out" first and flips to "signed in" a moment later;
- the store is written as soon as the login response arrives, so the name and
  the avatar are already right when the redirect lands.

Without the store, the header shows a sign-in button to a signed-in user for
a frame. With it, the first render is already correct.

**Not** justified for: a list of records (the query cache is exactly that), a
value only one component uses (that component's `useState`), or a value the
server owns and must survive a reload (persist it — but never a session, see
rule 2 below).

## Where a store lives

```text
apps/web/src/features/<domain>/
  index.ts              Barrel — the only import surface
  types.ts              Domain types
  hooks/                API calls and state normalisation
  components/           Domain components
  store/                Client-side state — one store per concern
    <name>-store.ts
  schemas/              zod schemas
```

The store is part of the feature, so it obeys the same boundary rules as the
rest of the folder. It is a **private** module: another feature reads the
state through the feature's hook (`useSession()`), never by importing the
store directly.

```typescript
// features/identity/hooks/use-session.ts — the public reading surface.
export function useSession() {
  const user = useSessionStore((state) => state.user);
  const isResolved = useSessionStore((state) => state.isResolved);

  return { user, isSignedIn: user !== null, isSignedOut: isResolved && user === null };
}
```

Export the store from `index.ts` only when something outside the feature
genuinely needs it — and even then, prefer exporting a hook over the store.

## The shape of a store

```typescript
'use client';

import { create } from 'zustand';
import type { CurrentUser } from '../types';

interface SessionState {
  user: CurrentUser | null;
  isResolved: boolean;
  setUser: (user: CurrentUser) => void;
  clearUser: () => void;
  markResolved: () => void;
}

export const useSessionStore = create<SessionState>()((set) => ({
  user: null,
  isResolved: false,
  setUser: (user) => set({ user, isResolved: true }),
  clearUser: () => set({ user: null, isResolved: true }),
  markResolved: () => set({ isResolved: true }),
}));
```

Note the `'use client'` directive: a store is client state, and the module
that creates it touches `window` semantics through React's client runtime.

The curried form `create<SessionState>()(…)` is the one to use — it is the
shape that accepts middleware (`persist`, `devtools`, `immer`) later without
changing the call site.

### The state is a fact, not a query flag

`user: CurrentUser | null` cannot express "not known yet". The header has to
tell three states apart — *checking*, *signed in*, *signed out* — so the
store carries an explicit `isResolved` next to the account.

The same reasoning as the domain hooks: expose explicit names, never a raw
nullable plus a guess. `useSession()` in `features/identity/hooks/use-session.ts`
turns the store into `isChecking` / `isSignedIn` / `isSignedOut`.

## The rules

1. **The API is the authority; the store is a cache.** A store never decides
   that a session is valid. `GET /me` decides that, and the store is
   refreshed from its answer.
2. **Do not persist a session.** A persisted store would show a name for a
   session that expired while the browser was closed — the header would claim
   the user is signed in until the first `GET /me` answered. The session is
   a cookie with its own lifetime, so the client keeps no copy of it across
   reloads.
3. **Write to the store from the domain layer, not from a component.** The
   domain hook (`hooks/use-me.ts`) owns the mapping from the API answer to
   the store. A component that writes to the store directly is a second,
   undisciplined path to the same state.
4. **Select narrowly.** `useSessionStore((state) => state.user)` subscribes to
   one field. Returning the whole state object re-renders every consumer on
   every write.
5. **Clear the cache when you clear the store.** A store and the query cache
   describing the same fact must be emptied together — see the logout below.

## Clearing a store from a mutation — the unmount trap

This is the one non-obvious rule, and it cost a real bug: sign-out on a page
that renders the account menu did not redirect.

TanStack Query v5 runs a mutation's callbacks in two tiers:

- **hook-level** callbacks — the ones passed to `useSomeMutation({ … })` —
  always run;
- **per-call** callbacks — the ones passed to `mutate(variables, { … })` —
  run only if the observer still has listeners when the mutation settles.

`MutationObserver._notify` checks `this.hasListeners()`. Unmounting the
component that owns the observer unsubscribes it, and the per-call callbacks
are silently dropped.

Now put a store clear in the picture:

```typescript
const mutation = useAuthControllerLogout({
  mutation: {
    onSettled: () => {
      queryClient.removeQueries({ queryKey: getAuthControllerMeQueryKey() });
      clearUser();          // ← unmounts the account menu
    },
  },
});
```

`clearUser()` removes the account from the store, the account menu renders
"Sign in" instead of the avatar, and the component that owned the observer
unmounts. If the redirect lived in a per-call `onSuccess`, it would never
fire:

```typescript
// Wrong — the redirect never runs.
logout.mutate(undefined, {
  onSuccess: () => router.replace('/'),
});
```

### The rule

**Cleanup that unmounts the caller is a hook-level concern. Navigation and
toasts are the caller's concern, and they must not be tied to the caller's
lifetime.**

```typescript
// Right — the promise continues regardless of the unmount.
logout
  .mutateAsync(undefined)
  .then(() => {
    showSnackbar({ severity: 'success', message: tIdentity('signedOutToast') });
    router.replace('/');
  })
  .catch(() => {
    showSnackbar({ severity: 'error', message: tIdentity('signOutFailed') });
  });
```

`mutateAsync` returns a promise; its continuation is not owned by the
component. The same reason applies to any side effect that has to survive an
unmount — a toast, a redirect, a `router.refresh()`.

The general form:

| Effect | Where it belongs |
| --- | --- |
| Clearing the cache, clearing the store | the mutation hook's `onSettled` |
| Redirecting, a toast, a refetch of another query | the caller's `mutateAsync().then()` |
| Feedback that must fire however the mutation was triggered | the hook's `onSuccess` / `onError` — but only if it does not unmount the caller |

## Writing to the store from a query

The pattern that keeps the store and the cache in step: the domain hook
watches the query result and writes to the store in an effect.

```typescript
useEffect(() => {
  if (data) {
    setUser(data);
    return;
  }

  if (isSignedOut) {
    clearUser();
    return;
  }

  if (query.isError) {
    markResolved();
  }
}, [data, isSignedOut, query.isError, setUser, clearUser, markResolved]);
```

The store is **refreshed** from the answer, not set once. That is what keeps
a session that expired in another tab from keeping its name in the header
until the next full reload.

Do not derive the write from `mutation.isSuccess` in a `useEffect` — it fires
twice under React Strict Mode. Drive the write from the **query** result, and
the **mutation** from an explicit handler.

## Checklist

- [ ] The value came from the API → it belongs in the query cache, not a store
- [ ] The store lives in `features/<domain>/store/` and is read through the
      feature's hook, not imported directly by another feature
- [ ] The store carries an explicit "known yet?" flag, not a bare nullable
- [ ] The store is not persisted when it holds a session
- [ ] The store is written from the domain hook, never from a component
- [ ] Selectors pick single fields, not the whole state
- [ ] A mutation that clears the store does its cleanup in `onSettled`, and
      its navigation/toast in the caller's `mutateAsync().then()`

## Common mistakes

| Mistake | Consequence |
| --- | --- |
| Copying a server list into a store | Two sources of truth for one fact; they drift |
| Persisting the session store | The header claims a signed-in user for an expired session |
| `mutate(vars, { onSuccess })` where the cleanup unmounts the caller | The callback never fires — the redirect silently does nothing |
| `useSessionStore()` with no selector | Every consumer re-renders on every write |
| A component writing to the store directly | A second path to the state, outside the domain layer |
| `useEffect` on `mutation.isSuccess` | Fires twice under React Strict Mode |
| Clearing the store but leaving the query cache | The screen reads a stale session back out of the cache |
| A store in `components/ui/` or `src/utils/` | State without a domain owner; it has no home to be cleared from |
