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
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    return this.profilesService.update(id, dto);
  }

  @ApiOperation({ summary: 'Xoá hồ sơ' })
  @ApiOkResponse({ description: 'Hồ sơ đã xoá', type: ProfileResponseDto })
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
| `@ApiOkResponse({ description, type })` | `GET`, `PATCH`, `DELETE` returning `200` |
| `@ApiCreatedResponse({ description, type })` | `POST` returning `201` |
| `@ApiNotFoundResponse({ description })` | A route that can 404 |
| `@ApiBadRequestResponse({ description })` | A route with a validated body or query |
| `@ApiForbiddenResponse({ description })` | A route that can 403 |
| `@ApiQuery({ name, required, example })` | A loose query parameter outside a DTO |

Always pass an explicit `type`. Without it Swagger infers `object` and the
generated client type is wrong.

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

## DTO decorators

A **request** DTO (used as `@Body()` or `@Query()`) needs both a Swagger
decorator and a class-validator decorator on every field. The whitelist in
the global `ValidationPipe` reads class-validator metadata, not Swagger
metadata.

| Field kind | Swagger | class-validator |
| --- | --- | --- |
| Required | `@ApiProperty({ example })` | `@IsString()`, `@IsNotEmpty()`, `@MaxLength(n)` |
| Optional | `@ApiPropertyOptional({ example })` | `@IsOptional()` plus the type validator |
| Enum | `@ApiProperty({ enum: X })` | `@IsEnum(X)` |
| Number | `@ApiProperty({ example: 42 })` | `@IsNumber()` |
| Boolean | `@ApiProperty({ example: true })` | `@IsBoolean()` |

What happens when one is missing, verified against the project's own
`ValidationPipe` configuration:

| Field has | Result |
| --- | --- |
| `@ApiProperty` only | `400` — "property title should not exist" |
| Validator only | Accepted, but missing from the OpenAPI spec, so the generated client types it as `any` |
| Both | Accepted and typed correctly |

A **response** DTO is only ever returned, never passed through the pipe, so
it needs `@ApiProperty` and no validator.

```typescript
// Request DTO — needs both.
export class CreateProfileDto {
  @ApiProperty({ example: 'Nguyễn Văn A' })
  @IsString()
  @IsNotEmpty()
  displayName: string;
}

// Response DTO — Swagger only.
export class ProfileResponseDto {
  @ApiProperty({ example: 'a1b2c3' })
  id: string;
}
```

## URL patterns

| Method | Path | Meaning |
| --- | --- | --- |
| `GET` | `/<resource>` | List, paginated |
| `GET` | `/<resource>/:id` | One record |
| `POST` | `/<resource>` | Create |
| `PATCH` | `/<resource>/:id` | Partial update |
| `DELETE` | `/<resource>/:id` | Soft delete when the entity has `deletedAt` |

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
| `@ApiProperty` without a class-validator decorator on a request DTO | `400` — the whitelist rejects the field as unknown |
| A class-validator decorator without `@ApiProperty` | The field is missing from the OpenAPI spec; the client types it as `any` |
| `throw new Error(...)` in a service | Returns a 500 with a generic body; the client cannot distinguish cases |
| Prisma query inside a controller | Business logic leaks out of the service; hard to test |
| Manual permission check in a controller | Easily bypassed and duplicated |
| Returning a raw Prisma entity | Leaks internal columns to the client |
| Missing `.js` on a local import | ESM resolution fails at runtime, not at build time |
| Deleting a published field | Breaks a frontend that has not been redeployed yet |

The envelope mistakes live in `researchos-contract`'s reference.
