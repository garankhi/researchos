---
name: researchos-api-endpoint
description: Creates and changes REST API endpoints in the ResearchOS NestJS backend — from DTO and service through Swagger annotations to the generated OpenAPI spec and the frontend Orval client. Use when adding or modifying an endpoint, controller, service, module, or DTO in apps/api, when a frontend screen needs a new API contract, or when the user mentions API routes, OpenAPI, Swagger, Orval codegen, DTO validation, session guard, role guard, permissions, or "new endpoint".
---

# ResearchOS API endpoint

How to take a feature from an empty NestJS module to a typed frontend
client. Follow the steps in order; each one has a verification that must pass
before moving on.

This file is the **checklist**. Each item states the rule, why it matters,
and where to read the how. Templates, decorator tables and code samples live
in `reference/` — read only the file you need.

The response envelope is not described here — it is produced by the backend
but owned by the `researchos-contract` skill. Read that skill before touching
the interceptor, the exception filter or the OpenAPI transform.

## Division of labour

| Concern | Owner |
| --- | --- |
| The wire format — envelope, error shape, codes | `researchos-contract` |
| Adding or changing an endpoint, codegen | **this skill** |
| The session guard, the role guard, access control | **this skill** |
| The wording — the message catalog, locale routing | `researchos-localization` |
| Building a screen against the generated client | `researchos-ui` |
| Forms — react-hook-form, zod, MUI form controls | `researchos-forms` |

`researchos-api-endpoint` decides **what the server says**;
`researchos-localization` owns the words the frontend renders for it.

## Non-negotiables

Eight rules account for most of the mistakes in this codebase. Each one is
counter-intuitive enough to be worth stating once, up front.

1. **Every route has `@ApiOperation({ summary })` with a non-empty summary** —
   no exceptions, however small the route.
   *Why:* the summary is the bold heading in Swagger UI and the JSDoc in the
   generated client. A vague one propagates into the frontend.
   → [controller.md](reference/controller.md#apioperation-summary--is-mandatory-on-every-route)

2. **A path parameter needs `@ApiParam({ name, description })`** — NestJS does
   not add it for you.
   *Why:* NestJS emits a bare `{ name: "id", in: "path" }` with nothing to
   read, and the test run fails on it.
   → [controller.md](reference/controller.md#every-parameter-needs-a-description)

3. **Every request DTO field has three things:** a Swagger decorator, a
   class-validator decorator, and a `description`.
   *Why:* the whitelist reads class-validator metadata, not Swagger
   metadata, so a field with only `@ApiProperty` is rejected with a `400`.
   → [module-and-dto.md](reference/module-and-dto.md#dto-decorators)

4. **Error responses declare no `type`** — the server always sends the shared
   error envelope.
   *Why:* the filter is global and the transform overwrites the schema, so a
   route-declared body is a type the server never sends.
   → [openapi-rules.md](reference/openapi-rules.md#error-responses-describe-the-shared-envelope)

5. **Error text is a code, not prose** — `snake_case`, never an English
   sentence.
   *Why:* prose on the wire means an English error for every Vietnamese user,
   and a backend deploy for every new language.
   → [error-codes.md](reference/error-codes.md#error-text-is-a-code-not-prose)

6. **Local imports end in `.js`.**
   *Why:* the tsconfig sets `module: nodenext` and the package is ESM, so the
   import fails at runtime, not at build time.
   → [module-and-dto.md](reference/module-and-dto.md#step-1--generate-the-module)

7. **Every route is protected by default.** The session guard is global, so a
   route opts out with `@Public()` — it is never protected with
   `@UseGuards(SessionGuard)`.
   *Why:* the guard is already applied everywhere; a per-route guard
   duplicates it and implies the routes without one are unprotected.
   → [auth-and-guards.md](reference/auth-and-guards.md#adding-a-new-route--the-decision)

8. **Roles are checked by the role guard; records are checked by the
   service.** A role check never goes in a controller, and a per-record check
   never goes in `common/guards/`.
   *Why:* a guard that could answer "may this caller see *this* row?" would
   have to know every domain entity — the boundary `common/` must not cross.
   → [auth-and-guards.md](reference/auth-and-guards.md#what-the-role-guard-is-not)

## Checklist

Each row links to the section that shows the how.

### Module

- [ ] One business domain = one module folder, named exactly like the
      frontend feature folder `apps/web/src/features/<domain>/`
      → [module-and-dto.md](reference/module-and-dto.md#step-1--generate-the-module)
- [ ] Module, controller, service and DTOs generated with `--flat`
      → [module-and-dto.md](reference/module-and-dto.md#step-1--generate-the-module)
- [ ] Local imports end in `.js`
      → [module-and-dto.md](reference/module-and-dto.md#step-1--generate-the-module)
- [ ] The module is registered in `src/app.module.ts`, which only wires
      modules together and holds no business logic
      → [module-and-dto.md](reference/module-and-dto.md#step-1--generate-the-module)

### DTO

- [ ] Every request DTO field has `@ApiProperty`/`@ApiPropertyOptional`
      **and** a class-validator decorator **and** a `description`
      → [module-and-dto.md](reference/module-and-dto.md#dto-decorators)
- [ ] Every response DTO property has `@ApiProperty` with a `description` —
      no validator needed, they are never validated
      → [module-and-dto.md](reference/module-and-dto.md#dto-decorators)
- [ ] An update DTO uses `PartialType(CreateDto)` rather than repeating
      decorators
      → [module-and-dto.md](reference/module-and-dto.md#step-2--write-the-dto)
- [ ] A numeric query DTO field has `@Type(() => Number)`
      → [module-and-dto.md](reference/module-and-dto.md#numeric-query-fields)
- [ ] Query parameters live in a DTO, not as scattered `@Query('page')`
      → [module-and-dto.md](reference/module-and-dto.md#step-2--write-the-dto)
- [ ] A DTO does not expose internal fields such as `createdAt`
      → [module-and-dto.md](reference/module-and-dto.md#step-2--write-the-dto)

### Service

- [ ] The service owns all business logic and is the only place that touches
      Prisma
      → [service.md](reference/service.md)
- [ ] `PrismaService` is injected through the constructor, never constructed
      inline and never threaded through parameters
      → [service.md](reference/service.md)
- [ ] Multi-table writes use `$transaction`
      → [service.md](reference/service.md#multi-table-write)
- [ ] Errors throw NestJS exceptions, not `throw new Error`
      → [service.md](reference/service.md#service)
- [ ] Internals never leak into an error message — stack traces, SQL and
      table names go to the logger
      → [service.md](reference/service.md#service)
- [ ] The service returns the **bare payload**, never the envelope
      → [service.md](reference/service.md#the-service-returns-the-payload-not-the-envelope)
- [ ] Permission enforced in the backend, never in the UI
      → [service.md](reference/service.md#service)

### Controller

- [ ] The controller has no Prisma query and no manual permission check
      → [controller.md](reference/controller.md)
- [ ] **Every route has `@ApiOperation({ summary })` with a non-empty
      summary** — no exceptions
      → [controller.md](reference/controller.md#apioperation-summary--is-mandatory-on-every-route)
- [ ] The route uses the status code for its method (`GET` 200, `POST` 201,
      `POST` job 202, `PUT`/`PATCH`/`DELETE` 200)
      → [controller.md](reference/controller.md#method-to-status-code)
- [ ] `PUT` replaces and `PATCH` updates — a partial update is a `PATCH`
      → [controller.md](reference/controller.md#method-to-status-code)
- [ ] `DELETE` returns 200 with the deleted entity, not 204
      → [controller.md](reference/controller.md#method-to-status-code)
- [ ] The controller returns the **bare payload** — the envelope is applied
      by the interceptor, never built by hand
      → [controller.md](reference/controller.md#the-controller-returns-the-payload)
- [ ] `@Api*Response` describes the **payload** type, not the envelope
      → [openapi-rules.md](reference/openapi-rules.md#the-envelope-is-not-described-by-hand)
- [ ] **Error responses declare no `type`** — the server always sends the
      shared error envelope
      → [openapi-rules.md](reference/openapi-rules.md#error-responses-describe-the-shared-envelope)
- [ ] A route behind a guard has `@ApiBearerAuth()` and
      `@ApiUnauthorizedResponse({ description })`
      → [controller.md](reference/controller.md#authentication)
- [ ] A route a signed-in caller can still be refused from also declares
      `@ApiForbiddenResponse({ description })`
      → [auth-and-guards.md](reference/auth-and-guards.md#swagger)
- [ ] Every path parameter has `@ApiParam({ name, description })`
      → [controller.md](reference/controller.md#every-parameter-needs-a-description)
- [ ] Every header parameter has `@ApiHeader({ name, description })`
      → [controller.md](reference/controller.md#every-parameter-needs-a-description)
- [ ] No type coercion in the controller — the pipe or the service does it
      → [controller.md](reference/controller.md)

### Auth and guards

- [ ] The route is **not** protected with `@UseGuards(SessionGuard)` — the
      session guard is global
      → [auth-and-guards.md](reference/auth-and-guards.md#adding-a-new-route--the-decision)
- [ ] A route open to everyone carries `@Public()`; every other route is
      protected by default
      → [auth-and-guards.md](reference/auth-and-guards.md#public)
- [ ] A route that needs a role carries `@Roles(...)` — the guard requires
      **every** listed role
      → [auth-and-guards.md](reference/auth-and-guards.md#the-role-guard)
- [ ] A handler that needs the caller's id takes
      `@CurrentUserId() userId: string` — never `string | undefined`
      → [auth-and-guards.md](reference/auth-and-guards.md#the-decorators)
- [ ] A per-record permission check lives in the owning module's **service**
      → [auth-and-guards.md](reference/auth-and-guards.md#what-the-role-guard-is-not)
- [ ] The controller has no manual permission check
      → [service.md](reference/service.md#service)
- [ ] `common/` names no business entity
      → [auth-and-guards.md](reference/auth-and-guards.md#the-shape-of-it)

### Error codes

- [ ] If `message` is not empty, it carries a **code** (`snake_case`, e.g.
      `opportunity_not_found`), never prose
      → [error-codes.md](reference/error-codes.md#error-text-is-a-code-not-prose)
- [ ] A new **domain** code is registered in
      `packages/error-codes/src/domain.ts` under the module's own key
      → [error-codes.md](reference/error-codes.md#adding-a-domain-code)
- [ ] A new domain code has an entry in `messages/vi.json` **and**
      `messages/en.json`, under `errors.codes.domain`
      → [error-codes.md](reference/error-codes.md#adding-a-domain-code)
- [ ] A domain code is raised through `domainErrorCodes.<module>.<name>`, not
      a string literal — an unregistered code does not compile
      → [error-codes.md](reference/error-codes.md#why-the-registry-and-not-a-string-literal)
- [ ] Validation messages (`errors[].messages`) are codes too
      (`{field}_{constraint}`, e.g. `title_required`), carried in the
      class-validator decorator's `message` option
      → [error-codes.md](reference/error-codes.md#validation-messages-are-codes-too)
- [ ] Every code the API can emit has an entry in `messages/vi.json`
      **and** `messages/en.json`, under the tier it belongs to
      → [error-codes.md](reference/error-codes.md#the-three-tiers)
- [ ] The FE falls back to a generic localized message when a code has no
      catalog entry — it never renders the raw code
      → [researchos-localization](../researchos-localization/SKILL.md)

### Contract and codegen

- [ ] `openapi.json` regenerated and committed
      → [tooling.md](reference/tooling.md#regenerate-the-contract)
- [ ] `pnpm --filter api openapi:check` passes — CI runs it
      → [tooling.md](reference/tooling.md#regenerate-the-contract)
- [ ] `openapi.json` has no component named `String`/`Number`/`Boolean`
      → [openapi-rules.md](reference/openapi-rules.md#the-rules-are-enforced-by-code)
- [ ] Orval client regenerated; no hand-written file inside `src/lib/api/`
      → [tooling.md](reference/tooling.md#regenerate-the-contract)
- [ ] A published field is not deleted — mark it deprecated first
      → [tooling.md](reference/tooling.md#regenerate-the-contract)
- [ ] Frontend feature folder uses the same domain name
      → [researchos-ui](../researchos-ui/SKILL.md)

### Verification

- [ ] `pnpm --filter api exec vitest run src/openapi-rules.spec.ts` passes
      → [openapi-rules.md](reference/openapi-rules.md#the-rules-are-enforced-by-code)
- [ ] `pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm test` pass
      → [tooling.md](reference/tooling.md#commands)
- [ ] `pnpm test:e2e` passes — only when the change touches the
      API ↔ Redis ↔ worker path
      → [tooling.md](reference/tooling.md#commands)

## Verifying

```powershell
pnpm --filter api openapi:check
pnpm --filter api test
pnpm build && pnpm lint && pnpm format:check && pnpm test
```

All of them must pass before the change is ready.

The OpenAPI rules are enforced by code, not by a reviewer — a red test names
the rule, the location and the fix. Run the rules spec after touching a
controller or a DTO.

## Section map

Read the file you need; do not read them all.

| File | Covers |
| --- | --- |
| [reference/module-and-dto.md](reference/module-and-dto.md) | Generating a module, the DTO decorators, request vs response DTOs, numeric query fields |
| [reference/service.md](reference/service.md) | Prisma access, transactions, the exception table, the payload-not-envelope rule |
| [reference/auth-and-guards.md](reference/auth-and-guards.md) | The session guard, the role guard, the decorators, the session cookie, access control |
| [reference/controller.md](reference/controller.md) | The controller template, method to status code, parameters, authentication, URL patterns, background work |
| [reference/error-codes.md](reference/error-codes.md) | The three code tiers, the domain code registry, adding a code, validation codes |
| [reference/openapi-rules.md](reference/openapi-rules.md) | The rules enforced by `openapi-rules.ts`, the shared error envelope, what a failure message looks like |
| [reference/tooling.md](reference/tooling.md) | The commands, codegen, testing, the common-mistakes table |

## Related skills

| Skill | Owns |
| --- | --- |
| `researchos-contract` | The response envelope and error codes on the wire |
| `researchos-localization` | The message catalog, the locale routing, the wording |
| `researchos-ui` | Building a screen against the generated client |
| `researchos-forms` | react-hook-form, zod, the MUI form controls |

## Reference

Rules and rationale: `docs/api-convention.md`, `docs/architecture.md`.
