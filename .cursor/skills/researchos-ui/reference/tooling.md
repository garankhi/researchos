# Tooling

The generated client, the eslint boundary rules, the commands to verify, and
the mistakes that are known to happen.

## Orval imports

The eslint rule `no-restricted-imports` blocks **value** imports from
`@/lib/api/*`. What it allows, verified against `apps/web/eslint.config.mjs`:

| Import | Allowed |
| --- | --- |
| `import { hook } from '@/lib/api'` | ✅ value, from the barrel |
| `import type { Dto } from '@/lib/api'` | ✅ type |
| `import type { Dto } from '@/lib/api/models'` | ✅ type |
| `import type { Dto } from '@/lib/api/models/dto'` | ✅ type |
| `import { hook } from '@/lib/api/health/health'` | ❌ deep value import |
| `import { thing } from '@/lib/api/models'` | ❌ deep value import |

A type-only import is permitted via `allowTypeImports` because a type is
erased at build time, so it cannot pull a deleted runtime module into the
bundle — which is the actual risk the rule guards against.

**The guard only matches the `@/lib/api/*` alias.** A relative import such as
`../../lib/api/health/health` would pass that rule untouched. The
`researchos/no-relative-imports-into-generated-api` rule closes that gap —
it resolves the relative path and fails if it lands inside `src/lib/api/`.
Always use the `@/` alias regardless, so the rule can see the import.

## The boundary rules

The boundary conventions are enforced by a local eslint plugin in
`apps/web/eslint-rules/researchos-boundaries.mjs`. The rules live in a file
rather than inline in `eslint.config.mjs` because two of them need the
filesystem — the backend module list is read from disk, not hardcoded.

| Rule | What it fails on |
| --- | --- |
| `researchos/no-domain-entities-in-ui` | A domain entity (`Profile`, `Opportunity`, `Taxonomy`, …) in `src/components/ui/` — matched in an import binding, an export name, a type reference, or JSX text |
| `researchos/no-cross-feature-imports` | `features/a/` importing from `features/b/` — by barrel or by deep path |
| `researchos/feature-name-matches-backend-module` | `features/x/` with no `apps/api/src/modules/x/` |
| `researchos/no-relative-imports-into-generated-api` | A relative import resolving into `src/lib/api/` |

The entity list is configurable through the rule's `entities` option, and the
rule is scoped to `src/components/ui/` only — a domain entity in
`features/taxonomy/components/` is exactly where it belongs.

The backend-module rule skips silently when `apps/api/src/modules/` is not
present, so a web-only checkout does not fail every file.

The rules and what they mean are described in
[features.md](features.md#the-five-rules).

## Commands

```powershell
# Verify
pnpm --filter web lint
pnpm --filter web build
pnpm build && pnpm lint && pnpm test
```

Verifying that a boundary rule fires:

```powershell
pnpm --filter web lint
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
| Relative import `../../lib/api/profiles/profiles` | Blocked by `researchos/no-relative-imports-into-generated-api`; and `clean: true` still deletes the file |
| Reading `query.data.data` | The mutator already unwrapped the envelope |
| `String(error)` in an error state | Shows `"AxiosError: Request failed with status code 500"` instead of the server's message |
| UI branching on raw query flags | Every screen repeats the state logic and its bugs |
| Feature importing another feature's files | Coupling; call the other feature's hook instead. Blocked by `researchos/no-cross-feature-imports` |
| `components/ui/` naming a domain entity | Breaks the shared-primitive boundary. Blocked by `researchos/no-domain-entities-in-ui` |
| A feature folder with no matching backend module | The screen cannot be traced back to its API. Blocked by `researchos/feature-name-matches-backend-module` |
| Copying an API response into a Zustand store | Two sources of truth for one fact; they drift. Keep server data in the query cache |
| A persisted Zustand store holding a session | The header claims a signed-in user for a session that expired while the browser was closed |
| `mutate(vars, { onSuccess })` where the cleanup clears a Zustand store | The per-call callback is dropped when the observer has no listeners — the redirect silently never happens. Use `mutateAsync().then()` |
| `useSomeStore()` with no selector | Every consumer re-renders on every write |
| Clearing the store but leaving the query cache | The screen reads a stale session back out of the cache |
| A user-facing string literal in a component | The string stays in one language forever. Use `t('…')` |
| Looking a validation message up in the catalog | Validation messages are not codes yet — there is no key for them |
| A custom component drops Chakra style props | Compose it with `chakra()` or apply the props to a Chakra wrapper |
| `useMediaQuery` branching for layout | The server renders the mobile branch; hydration mismatch and a flash of the wrong layout |
| A kept-mounted `Menu` without `display` on wide screens | The popup lingers in the DOM and flashes when the window is resized across the breakpoint |
| A fixed px popover width | Overflows a phone viewport |
| A flex child with text and no `minWidth: 0` | The row cannot shrink; a horizontal scrollbar appears |
| A responsive trigger is hidden while its portal stays visible | Apply the same Chakra breakpoint to the portaled positioner |
| `component={Link}` with `next/link` | "Functions cannot be passed directly to Client Components" |
| Reading the theme during render | Hydration mismatch |
| Exporting a component as `Error` | Shadows the global `Error`; breaks `instanceof` |
| `notFound()` in a click handler | It throws during a server render only — use a dedicated route |
| `forbidden()` without `authInterrupts` | Build fails |
