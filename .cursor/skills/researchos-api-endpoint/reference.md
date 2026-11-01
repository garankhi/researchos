# ResearchOS API endpoint — reference

Templates and lookup tables for `researchos-api-endpoint`. Read the section
you need; do not read this file end to end.

## Module template

`apps/api/src/modules/<domain>/<domain>.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { ProfilesController } from './profiles.controller.js';
import { ProfilesService } from './profiles.service.js';

@Module({
  controllers: [ProfilesController],
  providers: [ProfilesService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
```

Export a service only when another module needs it. Then that module imports
the owning module — never import across module folders directly.

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

## Service template

```typescript
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@researchos/database';
import { CreateProfileDto } from './dto/create-profile.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { ProfileResponseDto } from './dto/profile-response.dto.js';

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(id: string): Promise<ProfileResponseDto> {
    const profile = await this.prisma.profile.findUnique({ where: { id } });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    return this.toResponse(profile);
  }

  async create(dto: CreateProfileDto): Promise<ProfileResponseDto> {
    const existing = await this.prisma.profile.findFirst({
      where: { userId: dto.userId },
    });

    if (existing) {
      throw new ConflictException('Profile already exists');
    }

    const profile = await this.prisma.profile.create({ data: dto });

    return this.toResponse(profile);
  }

  /** Maps the Prisma entity onto the public response shape. */
  private toResponse(profile: Profile): ProfileResponseDto {
    return {
      id: profile.id,
      displayName: profile.displayName,
      createdAt: profile.createdAt.toISOString(),
    };
  }
}
```

## Multi-table write

```typescript
await this.prisma.$transaction(async (tx) => {
  const group = await tx.researchGroup.create({ data: groupData });
  await tx.researchGroupMember.create({
    data: { groupId: group.id, userId: ownerId, role: 'owner' },
  });
  return group;
});
```

## Swagger decorator checklist

| Decorator | When |
| --- | --- |
| `@ApiTags('domain')` | On the controller class, matches the module name |
| `@ApiOperation({ summary })` | **Every route, mandatory.** One line describing what the route does |
| `@ApiOkResponse({ description, type })` | `GET`, `PUT`, `PATCH`, `DELETE` returning `200` |
| `@ApiCreatedResponse({ description, type })` | `POST` returning `201` |
| `@ApiAcceptedResponse({ description, type })` | `POST` returning `202` for a queued job |
| `@ApiNoContentResponse({ description })` | A route with `@HttpCode(204)` |
| `@ApiNotFoundResponse({ description })` | A route that can 404 |
| `@ApiBadRequestResponse({ description })` | A route with a validated body or query |
| `@ApiUnauthorizedResponse({ description })` | A route behind a guard |
| `@ApiForbiddenResponse({ description })` | A route where a signed-in user can still be refused |
| `@ApiInternalServerErrorResponse({ description })` | A route that can fail unexpectedly |
| `@ApiParam({ name, description, example })` | Every path parameter |
| `@ApiHeader({ name, description, required, example })` | Every header parameter |
| `@ApiQuery({ name, description, required, example })` | A loose query parameter outside a DTO |
| `@ApiBearerAuth()` | A route that requires a session |

Always pass an explicit `type` on a **success** response. Without it Swagger
infers `object` and the generated client type is wrong.

**Never pass a `type` on an error response.** The server always answers a
failure with the shared error envelope, whatever the route declares.

### Method to status code

| Method | Success status | Response decorator | Request body |
| --- | --- | --- | --- |
| `GET` | 200 | `@ApiOkResponse` | none |
| `POST` | 201 | `@ApiCreatedResponse` | DTO |
| `POST` (long-running job) | 202 | `@ApiAcceptedResponse` | DTO |
| `PUT` | 200 | `@ApiOkResponse` | full DTO |
| `PATCH` | 200 | `@ApiOkResponse` | `PartialType` DTO |
| `DELETE` | 200 | `@ApiOkResponse` | none |

`PUT` replaces the resource, so its body is the complete new state.
`PATCH` updates part of it, so its body is a `PartialType` DTO. `DELETE`
returns the deleted entity so the frontend does not need a second request.
`POST` returns `202` only when the work finishes after the response — an
export, a sync, a digest, an embedding run.

### `@ApiOperation({ summary })` is mandatory on every route

There is no route — however small — that is exempt. The `summary` is the
endpoint's description: in Swagger UI it renders as the bold heading under
the path, and it is the first thing a reader sees.

```typescript
@ApiOperation({ summary: 'Returns the greeting after a configurable delay' })
@ApiOkResponse({ description: 'Greeting message', type: String })
@Get('slow')
async getSlow(@Query('delay') delay?: string): Promise<string> {
```

Rules for the summary text:

- One line, imperative, says what the route does ("Returns…", "Lists…",
  "Creates…").
- Never leave it out and let the path speak for itself. `/profiles/:id` does
  not say what it does or what it returns.
- A second sentence does not belong in the summary. Put it in the `description`
  field of the same `@ApiOperation`:

```typescript
@ApiOperation({
  summary: 'Lấy chi tiết một hồ sơ',
  description:
    'Trả về 404 nếu hồ sơ không tồn tại hoặc người dùng không có quyền xem.',
})
```

- The `summary` is copied verbatim into the generated Orval client as the
  function's JSDoc. A vague summary propagates into the frontend.

### `summary` vs `description`

Two different fields. Swagger UI shows both, in this order:

| Field | Where it shows up | Purpose |
| --- | --- | --- |
| `summary` | Bold heading under the path | One-line description of the route |
| `description` | Paragraph under the heading | Longer explanation, caveats, error cases |

The `description` of a *response* (`@ApiOkResponse({ description })`) is a
third, unrelated thing: it labels that status code in the Responses table.

### Every parameter needs a description

| Parameter kind | How it is documented |
| --- | --- |
| Path | `@ApiParam({ name, description, example })` |
| Header | `@ApiHeader({ name, description, required, example })` |
| Query (in a DTO) | `@ApiProperty({ description })` on the DTO field |
| Query (loose) | `@ApiQuery({ name, description, required, example })` |

NestJS generates a path parameter from the `@Param('id')` decorator alone,
and the result has no description at all. `@ApiParam` is what adds one:

```typescript
// Wrong — Swagger shows "id" with nothing to read.
@Get(':id')
findOne(@Param('id') id: string) { /* ... */ }

// Right.
@ApiParam({ name: 'id', description: 'Identifier of the opportunity.', example: 'a1b2c3' })
@Get(':id')
```

Query parameters belong in a DTO, where `@ApiProperty` already carries the
description into the spec. `@ApiQuery` is for the loose parameter that
cannot be a DTO field.

## DTO decorators

A **request** DTO (used as `@Body()` or `@Query()`) needs a Swagger
decorator, a class-validator decorator and a `description` on every field.
The whitelist in the global `ValidationPipe` reads class-validator metadata,
not Swagger metadata.

| Field kind | Swagger | class-validator |
| --- | --- | --- |
| Required | `@ApiProperty({ description, example })` | `@IsString()`, `@IsNotEmpty()`, `@MaxLength(n)` |
| Optional | `@ApiPropertyOptional({ description, example })` | `@IsOptional()` plus the type validator |
| Enum | `@ApiProperty({ description, enum: X })` | `@IsEnum(X)` |
| Number | `@ApiProperty({ description, example })` | `@IsNumber()` |
| Boolean | `@ApiProperty({ description, example })` | `@IsBoolean()` |

The `description` is mandatory. It is what the Swagger reader sees next to
the field, and it is the only place the meaning of a field is written down.

What happens when one is missing, verified against the project's own
`ValidationPipe` configuration:

| Field has | Result |
| --- | --- |
| `@ApiProperty` only | `400` — "property title should not exist" |
| Validator only | Accepted, but missing from the OpenAPI spec, so the generated client types it as `any` |
| Both | Accepted and typed correctly |

A **response** DTO is only ever returned, never passed through the pipe, so
it needs `@ApiProperty` and no validator. It still needs the `description`.

```typescript
// Request DTO — needs both, plus a description.
export class CreateProfileDto {
  @ApiProperty({
    description: 'Full name of the person, as it should appear on publications.',
    example: 'Nguyễn Văn A',
  })
  @IsString()
  @IsNotEmpty()
  displayName: string;
}

// Response DTO — Swagger only, plus a description.
export class ProfileResponseDto {
  @ApiProperty({
    description: 'Identifier of the profile.',
    example: 'a1b2c3',
  })
  id: string;
}
```

### Numeric query fields

`enableImplicitConversion` is on in the global `ValidationPipe`, but an
explicit `@Type` from `class-transformer` is what makes the Swagger schema
and the runtime coercion agree:

```typescript
import { Type } from 'class-transformer';

export class ListProfilesQueryDto {
  @ApiProperty({ description: 'Page number, 1-based.', example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number;
}
```

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

## Background work and large exports

Do not hold an HTTP request open for a long export, a sync, a digest or an
embedding run. Write the request to the database, enqueue the job, return
`202` with an id, and let the frontend poll.

Creation endpoints should accept an `Idempotency-Key` header, store the key,
and return the previous result when the key repeats.

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
pnpm build && pnpm lint && pnpm test
```

## Common mistakes

| Mistake | Consequence |
| --- | --- |
| A route with no `@ApiOperation` | Swagger shows a bare path with no explanation; the client gets no JSDoc |
| `@ApiOperation({ summary })` with an empty summary | Renders an empty heading — the same as having no summary at all |
| Two sentences crammed into `summary` | The second belongs in the `description` field of the same decorator |
| A path parameter with no `@ApiParam` | NestJS emits a bare `{ name, in: "path" }` with nothing to read |
| A DTO field with no `description` | The field is a name with no meaning in Swagger or the generated client |
| An error response that declares its own `type` | The spec describes a body the server never sends — the filter always answers with the shared error envelope |
| `@ApiProperty` without a class-validator decorator on a request DTO | `400` — the whitelist rejects the field as unknown |
| A class-validator decorator without `@ApiProperty` | The field is missing from the OpenAPI spec; the client types it as `any` |
| `throw new Error(...)` in a service | Returns a 500 with a generic body; the client cannot distinguish cases |
| Prisma query inside a controller | Business logic leaks out of the service; hard to test |
| Manual permission check in a controller | Easily bypassed and duplicated |
| Returning a raw Prisma entity | Leaks internal columns to the client |
| Missing `.js` on a local import | ESM resolution fails at runtime, not at build time |
| Deleting a published field | Breaks a frontend that has not been redeployed yet |

The rules above are checked by code. `apps/api/src/common/openapi/openapi-rules.ts`
holds them, and `apps/api/src/openapi-rules.spec.ts` runs them against the
real document, so a mistake fails `pnpm --filter api test` rather than
reaching a reviewer.

The envelope mistakes live in `researchos-contract`'s reference.
