# Module and DTO

Generating a module, the DTO decorators, and the difference between a request
DTO and a response DTO.

## Before starting

Identify the business domain, then check what already exists:

```powershell
Get-ChildItem -Recurse -File apps/api/src/modules | ForEach-Object { $_.FullName.Replace("$PWD\", "") }
```

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
the suffix. This is not a style preference: a missing suffix fails at
runtime, not at build time.

Register the module in `apps/api/src/app.module.ts`. That file only wires
modules together; it holds no business logic.

### Module template

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

One business domain = one module folder. The folder is named exactly like
the frontend feature folder `apps/web/src/features/<domain>/`, and the
eslint rule `researchos/feature-name-matches-backend-module` fails the build
when the two disagree.

## Step 2 — Write the DTO

A DTO is the API contract, not a Prisma model. It must not expose internal
fields such as `createdAt` or `internalNotes`.

### DTO decorators

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

The three decorators are not interchangeable, and each does a different job:

- `@ApiProperty` puts the field in the OpenAPI spec, so the generated client
  types it.
- A class-validator decorator (`@IsString()`, `@MaxLength()`) registers the
  field with class-validator.
- The `description` says what the field means. It is the only place a reader
  learns that `title` is a human-readable headline and not a slug.

### Other DTO rules

- Use `PartialType(CreateOpportunityDto)` from `@nestjs/swagger` for update
  DTOs rather than repeating decorators.
- Declare enums with `@ApiProperty({ enum: X })` and `@IsEnum(X)`.
- Query parameters also go in a DTO (`@Query() dto: ListQueryDto`), not as
  scattered `@Query('page') page?: string`. A query DTO field carries its
  `description` through `@ApiProperty` into the spec.
- A response DTO is the reference example: `HealthStatusDto`.

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

### A full request DTO

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateOpportunityDto {
  @ApiProperty({
    description: 'Human-readable headline of the opportunity, shown in listings.',
    example: 'Nghiên cứu vật liệu mới cho pinh năng lượng',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({
    description: 'Longer explanation of the opportunity and who is looking for.',
    example: 'Giảng viên cần cộng tác viên',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
```

### A validation code in the decorator

class-validator lets each decorator carry its own `message`, and that message
is what the validation pipe reports — so the message is where the code goes:

```typescript
export class CreateOpportunityDto {
  @ApiProperty({
    description: 'Human-readable headline of the opportunity, shown in listings.',
    example: 'Nghiên cứu vật liệu mới cho pinh năng lượng',
  })
  @IsString({ message: 'title_invalid' })
  @IsNotEmpty({ message: 'title_required' })
  @MaxLength(200, { message: 'title_too_long' })
  title: string;
}
```

The codes are qualified by the field they belong to, so `title_required` and
`description_required` never collide. The catalog holds the wording for each
one. See [error-codes.md](error-codes.md#validation-messages-are-codes-too).
