# Tooling

The commands, the codegen step, and the mistakes that are known to happen.

## Commands

```powershell
# Generate (always with --flat)
pnpm --dir apps/api exec nest generate module modules/profiles
pnpm --dir apps/api exec nest generate controller modules/profiles/profiles --flat
pnpm --dir apps/api exec nest generate service modules/profiles/profiles --flat
pnpm --dir apps/api exec nest generate class modules/profiles/dto/create-profile.dto --flat

# Regenerate the contract
pnpm codegen

# Verify the committed spec is up to date (CI runs this)
pnpm --filter api openapi:check

# Verify
pnpm --filter api test
pnpm --filter api lint
pnpm --filter api build
pnpm build && pnpm lint && pnpm format:check && pnpm test
```

The e2e suites live in `apps/api/test/` and are excluded from the default
`pnpm test` run — they need a database and a Redis. Run them when the change
touches the API ↔ Redis ↔ worker path:

```powershell
pnpm test:e2e
```

## Regenerate the contract

The OpenAPI spec is committed. The frontend client is generated from it and
never written by hand.

```powershell
pnpm codegen
```

`pnpm codegen` runs `api:openapi` → `web:orval` in order via Turborepo, and
is the command to run. The individual steps are:

```powershell
pnpm --filter api openapi     # writes apps/api/openapi.json
pnpm --filter web orval       # writes apps/web/src/lib/api
```

`pnpm --filter api openapi:check` verifies the committed `openapi.json`
matches what the code generates, without writing it. CI runs it, so a stale
spec cannot be committed.

Do not delete a field that is already published. Backend and frontend deploy
independently, so the client must stay backwards compatible with the older
API. Mark a field deprecated first.

`src/lib/api/` belongs to Orval — never hand-write a file there. The config
runs with `clean: true`, so the file is deleted on the next codegen.

## Wire the frontend feature

Create `apps/web/src/features/<domain>/` with `index.ts` (barrel), `types.ts`,
and `hooks/`. The feature folder name must match the module name. See the
`researchos-ui` skill for the full pattern.

## Test

Tests sit beside the file as `*.spec.ts` and run under Vitest.

```powershell
pnpm --filter api test
```

Use Vitest fake timers rather than real waits:

```typescript
vi.useFakeTimers();
const pending = controller.getSlow('999999');
await vi.advanceTimersByTimeAsync(30_000);
await expect(pending).resolves.toBe('Hello World!');
```

The specs worth knowing about:

| Spec | Covers |
| --- | --- |
| `src/openapi-rules.spec.ts` | The document satisfies every rule in `openapi-rules.ts` |
| `common/openapi/envelope-transform.spec.ts` | Idempotency, inline primitives, error responses, schema/filter agreement |
| `common/filters/http-exception.filter.spec.ts` | The error envelope, the code in `message`, validation grouping, no stack leak |

The envelope specs are described in the `researchos-contract` skill.

## Common mistakes

| Mistake | Consequence |
| --- | --- |
| A route with no `@ApiOperation` | Swagger shows a bare path with no explanation; the client gets no JSDoc |
| `@ApiOperation({ summary })` with an empty summary | Renders an empty heading — the same as having no summary at all |
| Two sentences crammed into `summary` | The second belongs in the `description` field of the same decorator |
| A path parameter with no `@ApiParam` | NestJS emits a bare `{ name, in: "path" }` with nothing to read |
| A DTO field with no `description` | The field is a name with no meaning in Swagger or the generated client |
| An error response that declares its own `type` | The spec describes a body the server never sends — the filter always answers with the shared error envelope |
| A success response with no `type` | Swagger infers `object`; the generated client type is wrong |
| `@ApiProperty` without a class-validator decorator on a request DTO | `400` — the whitelist rejects the field as unknown |
| A class-validator decorator without `@ApiProperty` | The field is missing from the OpenAPI spec; the client types it as `any` |
| A `PUT` that only sends some fields | The omitted fields are silently dropped |
| `throw new Error(...)` in a service | Returns a 500 with a generic body; the client cannot distinguish cases |
| An error message with prose instead of a code | The user sees the server's English, in one language forever |
| A domain code passed to `CodedHttpException` as a string literal | A compile error — the code is not in the registry |
| Prisma query inside a controller | Business logic leaks out of the service; hard to test |
| Manual permission check in a controller | Easily bypassed and duplicated |
| Returning a raw Prisma entity | Leaks internal columns to the client |
| Missing `.js` on a local import | ESM resolution fails at runtime, not at build time |
| Deleting a published field | Breaks a frontend that has not been redeployed yet |
| A hand-written file under `src/lib/api/` | Deleted on the next Orval run (`clean: true`) |

The rules above are checked by code. `apps/api/src/common/openapi/openapi-rules.ts`
holds them, and `apps/api/src/openapi-rules.spec.ts` runs them against the
real document, so a mistake fails `pnpm --filter api test` rather than
reaching a reviewer.

The envelope mistakes live in `researchos-contract`'s reference.
