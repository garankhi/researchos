import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { CreateResearchGroupDto } from './create-research-group.dto.js';

/**
 * Payload for updating research group details or archiving/restoring the group.
 *
 * Non-nullable columns (`code`, `name`, `leadId`, `isActive`) use
 * `@ValidateIf((_, value) => value !== undefined)` so that omitted fields
 * (`undefined`) are skipped while explicit `null` payloads are rejected with 400.
 */
export class UpdateResearchGroupDto extends PartialType(
  CreateResearchGroupDto,
) {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsUUID()
  leadId?: string;

  @ApiPropertyOptional({
    description:
      'Whether the research group is active. Setting to false archives the group (`is_active = false` and sets `archived_at`).',
    example: true,
  })
  @ValidateIf((_, value) => value !== undefined)
  @Transform(({ obj, key }) =>
    obj && typeof obj === 'object'
      ? (obj as Record<string, unknown>)[key]
      : undefined,
  )
  @IsBoolean()
  isActive?: boolean;
}
