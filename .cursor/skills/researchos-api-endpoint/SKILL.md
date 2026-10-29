---
name: researchos-api-endpoint
description: Creates and changes REST API endpoints in the ResearchOS NestJS backend — from DTO and service through Swagger annotations to the generated OpenAPI spec and the frontend Orval client. Use when adding or modifying an endpoint, controller, service, module, or DTO in apps/api, when a frontend screen needs a new API contract, or when the user mentions API routes, OpenAPI, Swagger, Orval codegen, DTO validation, or "new endpoint".
---

# ResearchOS API endpoint

Workflow for taking a feature from an empty NestJS module to a typed frontend
client. Follow the steps in order; each one has a verification that must pass
before moving on.

Canonical rules live in `docs/api-convention.md`. This skill is the *how*.

The response envelope is not described here — it is produced by the backend
but owned by the `researchos-contract` skill. Read that skill before touching
the interceptor, the exception filter or the OpenAPI transform.

## Before starting

Identify the business domain, then check what already exists:

```powershell
Get-ChildItem -Recurse -File apps/api/src/modules | ForEach-Object { $_.FullName.Replace("$PWD\", "") }
```

One domain = one module folder, named exactly like the frontend feature folder
in `apps/web/src/features/<domain>/`.

## Step 1 — Generate the module

Use Nest CLI with `--flat`. Without it the CLI creates a nested folder and
suffixes filenames.

```powershell
pnpm --dir apps/api exec nest generate module modules/profiles
pnpm --dir apps/api exec nest generate controller modules/profiles/profiles --flat
pnpm --dir apps/api exec nest generate service modules/profiles/profiles --flat
pnpm --dir apps/api exec nest generate class modules/profiles/dto/create-profile.dto --flat
```

Imports inside `apps/api` and `apps/worker` end in `.js` — the tsconfig sets
`module: nodenext` and the package is ESM. Every import of a local file needs
the suffix.

Register the module in `apps/api/src/app.module.ts`. That file only wires
modules together; it holds no business logic.

## Step 2 — Write the DTO

A DTO is the API contract, not a Prisma model. It must not expose internal
fields such as `createdAt` or `internalNotes`.

Every field needs **both** a Swagger decorator and a class-validator
decorator. They do different jobs and neither substitutes for the other:

- `@ApiProperty` puts the field in the OpenAPI spec, so the generated client
  types it.
- A class-validator decorator (`@IsString()`, `@MaxLength()`) registers the
  field with class-validator.

The global `ValidationPipe` runs with `whitelist: true` and
`forbidNonWhitelisted: true`, and whitelist uses **class-validator metadata**,
not Swagger metadata. A field with only `@ApiProperty` is treated as
unknown and the request is rejected with `400 property title should not
exist`. A field with only a validator decorator is validated but missing from
the OpenAPI spec, so the generated client types it as `any`.

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateOpportunityDto {
  @ApiProperty({ example: 'Nghiên cứu vật liệu mới cho pinh năng lượng' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ example: 'Giảng viên cần cộng tác viên' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
```

- Use `PartialType(CreateOpportunityDto)` from `@nestjs/swagger` for update
  DTOs rather than repeating decorators.
- Declare enums with `@ApiProperty({ enum: X })` and `@IsEnum(X)`.
- Query parameters also go in a DTO (`@Query() dto: ListQueryDto`), not as
  scattered `@Query('page') page?: string`.

**Response DTOs** are different: they are only ever returned, never passed
through the `ValidationPipe`, so they need `@ApiProperty` but no class-validator
decorators. `HealthStatusDto` is the reference example.

## Step 3 — Write the service

The service owns all business logic and is the only place that touches
Prisma.

- Inject `PrismaService` from `@researchos/database` through the constructor.
  Never construct a `PrismaClient` here, and never thread the service through
  function parameters.
- Use `$transaction` when writing more than one related table.
- Throw NestJS exceptions, never `throw new Error`:

| Situation | Exception |
| --- | --- |
| Record does not exist | `NotFoundException` |
| Missing or malformed input | `BadRequestException` |
| Not permitted | `ForbiddenException` |
| Not authenticated | `UnauthorizedException` |
| Conflicts with existing data | `ConflictException` |

- Never leak internals in an error message. Stack traces, SQL and table names
  go to the logger, not to the response.
- Return the DTO, or map the Prisma entity to a response DTO before returning.
  Returning the raw entity exposes internal columns.

Permission checks that depend on the specific record (does this user see
*this* row?) are business logic and belong in the service. Cross-cutting
guards live in `src/common/guards/` and must not name any entity.

### The service returns the payload, not the envelope

The service and the controller both return the **bare payload**. The
interceptor wraps it. See the `researchos-contract` skill for the envelope
shape and why the interceptor and the filter never overlap.

```typescript
// Right — the service returns the payload.
async findOne(id: string): Promise<OpportunityResponseDto> {
  const record = await this.prisma.opportunity.findUnique({ where: { id } });
  if (!record) throw new NotFoundException('Opportunity not found');
  return toOpportunityResponse(record);
}

// Wrong — the envelope is applied globally.
async findOne(id: string): Promise<{ success: boolean; data: OpportunityResponseDto }> {
  return { success: true, data: record, message: '' };
}
```

## Step 4 — Write the controller

The controller does four things: accept input, call the service, return the
result, declare Swagger. No Prisma queries and no manual permission checks.

```typescript
@ApiTags('opportunities')
@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

  @ApiOperation({ summary: 'Tạo cơ hội nghiên cứu' })
  @ApiCreatedResponse({ description: 'Cơ hội đã tạo', type: CreateOpportunityDto })
  @Post()
  create(@Body() dto: CreateOpportunityDto): Promise<CreateOpportunityDto> {
    return this.opportunitiesService.create(dto);
  }

  @ApiOperation({ summary: 'Lấy chi tiết một cơ hội' })
  @ApiOkResponse({ description: 'Chi tiết cơ hội', type: OpportunityResponseDto })
  @Get(':id')
  findOne(@Param('id') id: string): Promise<OpportunityResponseDto> {
    return this.opportunitiesService.findOne(id);
  }
}
```

- `@ApiTags` matches the module name, unaccented.
- Do not coerce types in the controller; leave that to the pipe or the service.

### Mandatory: `@ApiOperation({ summary })` on every route

Every route handler carries `@ApiOperation` with a non-empty `summary`. This
is mandatory — there is no exception, and no route is "too small to document".

- The `summary` is the endpoint's description. In Swagger UI it is the bold
  heading rendered directly under the path, and it is what a reader sees first.
  Write it as a single line that says what the route does, in the imperative
  ("Returns…", "Lists…", "Creates…").
- Do not leave `summary` out and rely on the route path to explain itself.
  `/profiles/:id` does not say what it does or what it returns.
- Keep it to one line. A second sentence belongs in the `description` field of
  the same `@ApiOperation`, not appended to the `summary`.
- The `summary` is copied verbatim into the generated Orval client as the
  function's JSDoc, so it is what a frontend developer reads in
  `src/lib/api/`. A vague summary propagates into the frontend.

Every route also needs an `@Api*Response` with an explicit `type`. Missing
annotations make Swagger describe the endpoint wrongly, and the generated
client inherits the mistake.

**Do not describe the envelope in the controller.** Annotate the *payload*
type, exactly as you would without the envelope:

```typescript
// Right — the payload type. The envelope is added by the OpenAPI transform.
@ApiOkResponse({ description: 'Chi tiết cơ hội', type: OpportunityResponseDto })
```

Describing the envelope by hand (`type: HealthStatusDtoEnvelope`) would
double-wrap it: the transform already wraps every `2xx` response, and it
skips an already-wrapped schema, so the mistake is silent rather than loud.

URL conventions: plural kebab-case resources (`/opportunities`), nested
children only when the child cannot exist alone
(`/research-groups/:groupId/members`), actions as `POST`
(`/opportunities/:id/close`). No `/api` prefix, no more than two nesting
levels.

## Step 5 — Test

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

## Step 6 — Regenerate the contract

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

Do not delete a field that is already published. Backend and frontend deploy
independently, so the client must stay backwards compatible with the older
API. Mark a field deprecated first.

## Step 7 — Wire the frontend feature

Create `apps/web/src/features/<domain>/` with `index.ts` (barrel), `types.ts`,
and `hooks/`. The feature folder name must match the module name. See the
`researchos-ui` skill for the full pattern.

## Step 8 — Verify

```powershell
pnpm build
pnpm lint
pnpm test
```

All three must pass before the change is ready.

## Checklist

- [ ] Module, controller, service, DTO under `src/modules/<domain>/`, generated with `--flat`
- [ ] Local imports end in `.js`
- [ ] Every request DTO field has `@ApiProperty`/`@ApiPropertyOptional` **and** a class-validator decorator
- [ ] Response DTOs have `@ApiProperty` (no validator needed — they are never validated)
- [ ] Controller has no Prisma query and no manual permission check
- [ ] **Every route has `@ApiOperation({ summary })` with a non-empty summary** — no exceptions
- [ ] Controller returns the **bare payload** — the envelope is applied by the interceptor, never built by hand
- [ ] `@Api*Response` describes the **payload** type, not the envelope
- [ ] Errors throw NestJS exceptions, not `throw new Error`
- [ ] Permission enforced in the backend
- [ ] Multi-table writes use `$transaction`
- [ ] `openapi.json` regenerated and committed
- [ ] `openapi.json` has no component named `String`/`Number`/`Boolean` (primitives stay inline)
- [ ] Orval client regenerated; no hand-written file inside `src/lib/api/`
- [ ] Frontend feature folder uses the same domain name
- [ ] `pnpm build`, `pnpm lint`, `pnpm test` pass

## Reference

Copy-paste templates, the Swagger decorator checklist and the URL patterns:
[reference.md](reference.md).

Rules and rationale: `docs/api-convention.md`, `docs/architecture.md`.
