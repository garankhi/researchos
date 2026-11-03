# Service

The service owns all business logic and is the only place that touches
Prisma.

## Service

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

### Multi-table write

```typescript
await this.prisma.$transaction(async (tx) => {
  const group = await tx.researchGroup.create({ data: groupData });
  await tx.researchGroupMember.create({
    data: { groupId: group.id, userId: ownerId, role: 'owner' },
  });
  return group;
});
```

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

## Background work and large exports

Do not hold an HTTP request open for a long export, a sync, a digest or an
embedding run. Write the request to the database, enqueue the job, return
`202` with an id, and let the frontend poll.

Creation endpoints should accept an `Idempotency-Key` header, store the key,
and return the previous result when the key repeats.
