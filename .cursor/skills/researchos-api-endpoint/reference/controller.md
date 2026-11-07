# Controller

The controller does four things: accept input, call the service, return the
result, declare Swagger. No Prisma queries and no manual permission checks.

## Controller template

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ProfilesService } from './profiles.service.js';
import { CreateProfileDto } from './dto/create-profile.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { ListProfilesQueryDto } from './dto/list-profiles.query.dto.js';
import { ProfileResponseDto } from './dto/profile-response.dto.js';

@ApiTags('profiles')
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @ApiOperation({ summary: 'Liệt kê hồ sơ' })
  @ApiOkResponse({ description: 'Danh sách hồ sơ', type: [ProfileResponseDto] })
  @Get()
  findAll(@Query() query: ListProfilesQueryDto): Promise<ProfileResponseDto[]> {
    return this.profilesService.findAll(query);
  }

  @ApiOperation({ summary: 'Lấy chi tiết một hồ sơ' })
  @ApiOkResponse({ description: 'Chi tiết hồ sơ', type: ProfileResponseDto })
  @ApiNotFoundResponse({ description: 'Không tìm thấy hồ sơ' })
  @ApiParam({ name: 'id', description: 'Identifier of the profile.' })
  @Get(':id')
  findOne(@Param('id') id: string): Promise<ProfileResponseDto> {
    return this.profilesService.findOne(id);
  }

  @ApiOperation({ summary: 'Tạo hồ sơ mới' })
  @ApiCreatedResponse({ description: 'Hồ sơ đã tạo', type: ProfileResponseDto })
  @Post()
  create(@Body() dto: CreateProfileDto): Promise<ProfileResponseDto> {
    return this.profilesService.create(dto);
  }

  @ApiOperation({ summary: 'Cập nhật một phần hồ sơ' })
  @ApiOkResponse({ description: 'Hồ sơ sau khi cập nhật', type: ProfileResponseDto })
  @ApiParam({ name: 'id', description: 'Identifier of the profile.' })
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    return this.profilesService.update(id, dto);
  }

  @ApiOperation({ summary: 'Xoá hồ sơ' })
  @ApiOkResponse({ description: 'Hồ sơ đã xoá', type: ProfileResponseDto })
  @ApiParam({ name: 'id', description: 'Identifier of the profile.' })
  @Delete(':id')
  remove(@Param('id') id: string): Promise<ProfileResponseDto> {
    return this.profilesService.remove(id);
  }
}
```

- `@ApiTags` matches the module name, unaccented.
- Do not coerce types in the controller; leave that to the pipe or the service.

## Method to status code

Each method has one expected success status. Do not mix them up.

| Method | Success status | Response decorator | Request body |
| --- | --- | --- | --- |
| `GET` | 200 | `@ApiOkResponse` | none |
| `POST` | 201 | `@ApiCreatedResponse` | DTO |
| `POST` (long-running job) | 202 | `@ApiAcceptedResponse` | DTO |
| `PUT` | 200 | `@ApiOkResponse` | full DTO |
| `PATCH` | 200 | `@ApiOkResponse` | `PartialType` DTO |
| `DELETE` | 200 | `@ApiOkResponse` | none |

- **`PUT` replaces, `PATCH` updates.** A `PUT` body describes the complete
  new state of the resource. A `PATCH` body describes only the fields that
  change, so its DTO is built with `PartialType`. If the update is partial,
  use `PATCH`; `PUT` with a partial body silently drops the omitted fields
  in most clients' expectations.
- **`DELETE` returns 200 with the deleted entity** in this codebase, not
  `204`. Return the resource so the frontend can show what was removed.
- **`POST` returns 202** only for work that finishes after the response —
  an export, a sync, a digest, an embedding run. The response body carries
  the id of the queued job and the frontend polls it. Ordinary creates
  return 201.
- A route that returns nothing useful can use `@HttpCode(204)` with
  `@ApiNoContentResponse({ description })`, but the default of returning the
  entity is preferred so the client does not need a second request.

## Every parameter needs a description

A parameter in the OpenAPI spec is what a reader sees next to the input
box, so it carries a `description`.

| Parameter kind | How it is documented |
| --- | --- |
| Path | `@ApiParam({ name, description, example })` |
| Header | `@ApiHeader({ name, description, required, example })` |
| Query (in a DTO) | `@ApiProperty({ description })` on the DTO field |
| Query (loose) | `@ApiQuery({ name, description, required, example })` |

A **path parameter has no description unless you add `@ApiParam`**. NestJS
generates the parameter from the `@Param('id')` decorator alone, and the
result is a bare `{ "name": "id", "in": "path" }` entry with nothing to read.
This is not a style preference — `apps/api` fails the test run if any
parameter in the document lacks a description.

```typescript
// Wrong — Swagger shows "id" with no explanation.
@Get(':id')

// Right — the path parameter is described.
@ApiParam({
  name: 'id',
  description: 'Identifier of the opportunity.',
  example: 'a1b2c3',
})
@Get(':id')
```

Query parameters belong in a DTO, and a DTO field already carries a
description through `@ApiProperty`. Use `@ApiQuery` only for a loose
parameter that cannot be a DTO field, and give it a `description` too.

## `@ApiOperation({ summary })` is mandatory on every route

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

```typescript
@ApiOperation({ summary: 'Returns the greeting after a configurable delay' })
@ApiOkResponse({ description: 'Greeting message', type: String })
@Get('slow')
async getSlow(@Query('delay') delay?: string): Promise<string> {
```

Rules for the summary text:

- One line, imperative, says what the route does ("Returns…", "Lists…",
  "Creates…").
- Never leave it out and let the path speak for itself.
- A second sentence does not belong in the summary. Put it in the `description`
  field of the same `@ApiOperation`:

```typescript
@ApiOperation({
  summary: 'Lấy chi tiết một hồ sơ',
  description:
    'Trả về 404 nếu hồ sơ không tồn tại hoặc người dùng không có quyền xem.',
})
```

### `summary` vs `description`

Two different fields. Swagger UI shows both, in this order:

| Field | Where it shows up | Purpose |
| --- | --- | --- |
| `summary` | Bold heading under the path | One-line description of the route |
| `description` | Paragraph under the heading | Longer explanation, caveats, error cases |

The `description` of a *response* (`@ApiOkResponse({ description })`) is a
third, unrelated thing: it labels that status code in the Responses table.

## Authentication

A route that requires a session says so in the spec, so the frontend knows
before it calls:

```typescript
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not signed in.' })
```

Add `@ApiUnauthorizedResponse` to any route behind a guard, and
`@ApiForbiddenResponse` to a route where a signed-in user can still be
refused. A route that is deliberately public says so in a comment above the
handler, per `docs/api-convention.md`.

```typescript
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not signed in.' })
@ApiForbiddenResponse({ description: 'The caller does not hold the required role.' })
@Roles(ROLES.ADMIN)
@Get('users')
listUsers(): UsersDto { ... }
```

The session guard is **global**, so a route does not carry
`@UseGuards(SessionGuard)` — it is protected by default, and a public route
opts out with `@Public()`. The guards, the decorators and the decision a new
route has to make: [auth-and-guards.md](auth-and-guards.md).

## The controller returns the payload

The controller returns the **bare payload**. The envelope is applied by the
global interceptor.

```typescript
// Right.
@Get(':id')
findOne(@Param('id') id: string): Promise<OpportunityResponseDto> {
  return this.opportunitiesService.findOne(id);
}
```

Every route also needs an `@Api*Response` with an explicit `type`. Missing
annotations make Swagger describe the endpoint wrongly, and the generated
client inherits the mistake.

**Do not describe the envelope in the controller.** Annotate the *payload*
type, exactly as you would without the envelope:

```typescript
// Right — the payload type. The envelope is added by the OpenAPI transform.
@ApiOkResponse({ description: 'Chi tiết cơ hội', type: OpportunityResponseDto })
```

See [openapi-rules.md](openapi-rules.md#the-envelope-is-not-described-by-hand)
for why describing the envelope by hand is silent rather than loud.

## URL patterns

| Method | Path | Meaning |
| --- | --- | --- |
| `GET` | `/<resource>` | List, paginated |
| `GET` | `/<resource>/:id` | One record |
| `POST` | `/<resource>` | Create |
| `POST` | `/<resource>/:id/<action>` | An action that is not CRUD (`/opportunities/:id/close`) |
| `PUT` | `/<resource>/:id` | Replace the whole record |
| `PATCH` | `/<resource>/:id` | Update part of the record |
| `DELETE` | `/<resource>/:id` | Soft delete when the entity has `deletedAt` |

`PUT` and `PATCH` both target `/<resource>/:id`. They differ in the body:
`PUT` carries the complete new state, `PATCH` carries only the fields that
change.

URL conventions: plural kebab-case resources (`/opportunities`), nested
children only when the child cannot exist alone
(`/research-groups/:groupId/members`), actions as `POST`
(`/opportunities/:id/close`). No `/api` prefix, no more than two nesting
levels.
