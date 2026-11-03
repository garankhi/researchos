---
name: researchos-ui
description: Builds Next.js App Router screens in the ResearchOS web app — folder boundaries, the Orval-generated API client, TanStack Query state handling, loading skeletons, error boundaries, responsive layout conventions, and the 404/401/403 route conventions. Use when creating or changing a page, feature, hook, or component in apps/web, when consuming an API endpoint, or when the user mentions loading states, error states, React Query, Orval, MUI, dark mode, responsive design, breakpoints, or Next.js route conventions.
---

# ResearchOS UI

How to build a screen in `apps/web` against the generated API client.

This file is the **checklist**. Each item states the rule, why it matters,
and where to read the how. Templates, prop tables and code samples live in
`reference/` — read only the file you need.

The response envelope is not described here — it is produced by the backend
but owned by the `researchos-contract` skill. Read that skill when a response
looks wrong or when `query.data` has the wrong type.

## Division of labour

| Concern | Owner |
| --- | --- |
| The wire format — envelope, error shape, codes | `researchos-contract` |
| How to build a screen, folder boundaries, state, feedback | **this skill** |
| Forms — react-hook-form, zod, MUI form controls | `researchos-forms` |
| Wording — the message catalog, locale routing | `researchos-localization` |
| Adding or changing an endpoint, codegen | `researchos-api-endpoint` |

`researchos-ui` decides **where** a message appears; `researchos-localization`
owns the words it carries.

## Non-negotiables

Six rules account for most of the mistakes in this codebase. Each one is
counter-intuitive enough to be worth stating once, up front.

1. **`query.data` is already the payload — never `query.data.data`.** The
   Orval mutator `src/lib/axios-instance.ts` unwraps one level.
   *Why:* a manual unwrap reads `undefined` and looks like a backend bug.
   → [data-and-errors.md](reference/data-and-errors.md#the-response-envelope-in-one-line)

2. **`isFetching` ≠ `isPending`.** `isPending` is `true` forever on a query
   with `enabled: false`.
   *Why:* a spinner bound to it never stops, and a button disabled by it can
   never be clicked.
   → [data-and-errors.md](reference/data-and-errors.md#query-state-cheat-sheet)

3. **`src/lib/api/` belongs to Orval — never hand-write a file there.** The
   config runs with `clean: true`, so it is deleted on the next codegen.
   *Why:* the file looks fine until the next `pnpm --filter web orval`.
   → [features.md](reference/features.md#1-the-generated-api-tree-belongs-to-orval)

4. **Success → snackbar. Failure → inline state, next to what failed.**
   *Why:* a snackbar auto-hides, so an error the user did not read in four
   seconds is an error they will repeat. Success is a notification; failure
   is a state.
   → [loading-and-feedback.md](reference/loading-and-feedback.md#mutation-feedback)

5. **Resolve backend error codes through the catalog.** Use
   `resolveErrorCode()` / `resolveFieldErrorCodes()`, never `String(error)`,
   and never render the server's raw value.
   *Why:* the raw value is a `snake_case` code, or an axios message; a
   literal stays in one language forever.
   → [data-and-errors.md](reference/data-and-errors.md#error-codes)

6. **Every user-facing string comes from the message catalog** via `t()`.
   *Why:* the app has two locales; a literal is one language forever.
   → [loading-and-feedback.md](reference/loading-and-feedback.md#mutation-feedback)

## Checklist

Each row links to the section that shows the how.

### Feature

- [ ] Feature folder named after the backend module —
      `features/taxonomy/` ↔ `apps/api/src/modules/taxonomy/`
      → [features.md](reference/features.md#4-the-feature-folder-name-matches-the-backend-module)
- [ ] `index.ts` barrel is the only import surface; no deep imports into
      another feature
      → [features.md](reference/features.md#the-feature-folder)
- [ ] Domain types live in `types.ts`, derived from the generated models
      → [features.md](reference/features.md#the-feature-folder)
- [ ] The domain hook normalises state; the UI branches on explicit flags
      (`isLoaded` / `isFetching` / `isFailed`), never on raw query flags
      → [features.md](reference/features.md#the-feature-folder)
- [ ] No hand-written file under `src/lib/api/`; values import from
      `@/lib/api`, types from `@/lib/api/models`
      → [tooling.md](reference/tooling.md#orval-imports)
- [ ] A shared helper used by two features lives in `src/utils/`, not
      duplicated
      → [features.md](reference/features.md#5-srcutils-holds-shared-utility-functions)

### Data

- [ ] `query.data` is the payload — no manual unwrapping of the envelope
      → [data-and-errors.md](reference/data-and-errors.md#the-response-envelope-in-one-line)
- [ ] `isFetching` for in-flight, `isPending` only for a never-resolved
      *enabled* query
      → [data-and-errors.md](reference/data-and-errors.md#query-state-cheat-sheet)
- [ ] A detail query guards the request with `enabled: Boolean(id)`
      → [features.md](reference/features.md#hooksuse-profilets--detail)
- [ ] Errors are read through `apiErrorCode()`, never `String(error)`
      → [data-and-errors.md](reference/data-and-errors.md#the-response-envelope-in-one-line)
- [ ] Backend error text is resolved with `resolveErrorCode()` /
      `resolveFieldErrorCodes()` — the server's raw value is never rendered
      → [data-and-errors.md](reference/data-and-errors.md#error-codes)

### Loading

- [ ] Block loading uses a skeleton sized like the real content — no
      page-level spinner
      → [loading-and-feedback.md](reference/loading-and-feedback.md#loading-states)
- [ ] Mutations show a spinner in the button, bound to the **mutation's**
      `isPending`
      → [loading-and-feedback.md](reference/loading-and-feedback.md#spinners-for-mutations)
- [ ] A list that loaded with zero rows renders `EmptyState` — that is a
      success, not an error
      → [loading-and-feedback.md](reference/loading-and-feedback.md#loading-states)

### Errors and feedback

- [ ] Every mutation has a success feedback (snackbar) **and** an error
      feedback (inline, next to what failed)
      → [loading-and-feedback.md](reference/loading-and-feedback.md#mutation-feedback)
- [ ] Validation errors are rendered per field with `FieldError`, never
      flattened into one message
      → [data-and-errors.md](reference/data-and-errors.md#error-codes)
- [ ] Every error state offers a retry or another way forward
      → [routing.md](reference/routing.md#error-states)
- [ ] Route errors are handled by the narrowest `error.tsx`; a root-layout
      failure goes to `global-error.tsx`
      → [routing.md](reference/routing.md#error-states)
- [ ] `error.tsx` uses `retry`, narrows `error` from `unknown`, and is not
      exported as `Error`
      → [routing.md](reference/routing.md#segment--appsegmenterrortsx)
- [ ] `notFound()` / `unauthorized()` / `forbidden()` are called from a
      dedicated route, never from a click handler
      → [routing.md](reference/routing.md#access-boundaries)

### UI

- [ ] MUI layout props (`gap`, `flex`, `py`, `px`, `alignItems`,
      `textAlign`, `fontWeight`) go through `sx`
      → [mui-and-responsive.md](reference/mui-and-responsive.md#v9-prop-surface)
- [ ] Links use the `components/ui/link` wrapper, not `component={Link}`
      → [mui-and-responsive.md](reference/mui-and-responsive.md#links)
- [ ] Responsive layout uses `sx` breakpoints, not a `useMediaQuery` branch
      → [mui-and-responsive.md](reference/mui-and-responsive.md#swap-with-sx-do-not-measure)
- [ ] MUI and Tailwind breakpoints are never mixed in one tree
      → [mui-and-responsive.md](reference/mui-and-responsive.md#breakpoints)
- [ ] Collapsed menus hide themselves on wide screens (`display` on the
      `Menu`)
      → [mui-and-responsive.md](reference/mui-and-responsive.md#the-collapse-to-a-menu-pattern)
- [ ] Flex children that hold text set `minWidth: 0`; popovers use
      `min(92vw, …)`
      → [mui-and-responsive.md](reference/mui-and-responsive.md#never-let-a-child-overflow)
- [ ] The theme is read only after mount, via `useSyncExternalStore`
      → [mui-and-responsive.md](reference/mui-and-responsive.md#dark-mode)

### i18n and verification

- [ ] No user-facing string literal — every one comes from the message
      catalog via `t()`
      → [loading-and-feedback.md](reference/loading-and-feedback.md#mutation-feedback)
- [ ] Every code the API can emit has an entry in `messages/vi.json`
      **and** `messages/en.json` under the tier it belongs to —
      `errors.codes`, `errors.codes.fields` or `errors.codes.domain`
      → [researchos-localization](../researchos-localization/SKILL.md)
- [ ] A **domain** code the screen renders is registered in
      `packages/error-codes/src/domain.ts` — the catalog check reads that
      registry, so an unregistered code fails `pnpm --filter web test`
      → [researchos-localization](../researchos-localization/SKILL.md)
- [ ] `pnpm build`, `pnpm lint`, `pnpm test` pass
      → [tooling.md](reference/tooling.md#commands)
- [ ] The change was checked in a browser, not just in the build — a passing
      build does not prove the loading state appears, the error state
      recovers, or the cascade resolves in the right order
      → [tooling.md](reference/tooling.md#commands)

## Verifying

```powershell
pnpm --filter web lint
pnpm --filter web build
pnpm build && pnpm lint && pnpm test
```

Check the change in a browser, not just the build. A build passing does not
prove the loading state appears, the error state recovers, or the cascade
resolves in the right order.

`/demo` is a scratch page that exercises these conventions end to end — MUI
components, the cascade, dark mode, the API client, loading, error and the
access boundaries. Use it to confirm a change behaves.

If the change adds or changes an endpoint, regenerate the client first — see
the `researchos-api-endpoint` skill for the codegen step.

## Section map

Read the file you need; do not read them all.

| File | Covers |
| --- | --- |
| [reference/features.md](reference/features.md) | Folder boundaries, the five rules, transport → domain → UI, the feature folder and its templates, form rules |
| [reference/data-and-errors.md](reference/data-and-errors.md) | The response envelope, query flags and the `isPending` trap, error codes and field errors |
| [reference/loading-and-feedback.md](reference/loading-and-feedback.md) | Skeletons, mutation indicators, shared primitives, the snackbar provider, mutation feedback |
| [reference/mui-and-responsive.md](reference/mui-and-responsive.md) | MUI v9 props, links, the Tailwind/MUI cascade, breakpoints, overflow, dark mode |
| [reference/routing.md](reference/routing.md) | Error states at each level, route templates, access boundaries, Next.js file conventions, Suspense |
| [reference/tooling.md](reference/tooling.md) | Orval imports, the eslint boundary rules, commands, query-vs-mutation hooks, the common-mistakes table |

## Related skills

| Skill | Owns |
| --- | --- |
| `researchos-contract` | The response envelope and error codes on the wire |
| `researchos-forms` | react-hook-form, zod, the MUI form controls, the form eslint rules |
| `researchos-localization` | The message catalog, the locale routing, the wording |
| `researchos-api-endpoint` | Adding an endpoint, the DTOs, the OpenAPI spec, the codegen |

## Reference

Rules and rationale: `docs/architecture.md`.
