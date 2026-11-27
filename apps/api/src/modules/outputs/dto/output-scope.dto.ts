import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OutputAudience, OutputScopeType } from '@researchos/database';
import { IsIn, IsOptional, IsUUID, ValidateIf } from 'class-validator';

/**
 * Where a work is posted.
 *
 * The scope says who owns the work and therefore who may change its
 * audience. It is fixed at creation: moving a work to another container
 * would silently change who may edit it and who may read it.
 */
export class OutputScopeDto {
  @ApiProperty({
    description:
      'The posting context of the work: PERSONAL (its author owns it), ' +
      'GROUP (the group owns it) or PROJECT (the project owns it).',
    enum: OutputScopeType,
    example: OutputScopeType.PERSONAL,
  })
  @IsIn(
    [OutputScopeType.PERSONAL, OutputScopeType.GROUP, OutputScopeType.PROJECT],
    { message: 'output_scope_invalid' },
  )
  scopeType: OutputScopeType;

  @ApiPropertyOptional({
    description:
      'The group the work is posted in. Required for a GROUP scope. For a ' +
      'PROJECT scope it is the parent group, when the project has one; ' +
      'omit it for a standalone project.',
    format: 'uuid',
    example: '55555555-5555-4555-8555-555555555555',
  })
  @ValidateIf(
    (dto: OutputScopeDto, value) =>
      value !== undefined || dto.scopeType === OutputScopeType.GROUP,
  )
  @IsUUID(undefined, { message: 'id_uuid' })
  scopeGroupId?: string;

  @ApiPropertyOptional({
    description:
      'The project the work is posted in. Required for a PROJECT scope.',
    format: 'uuid',
    example: '66666666-6666-4666-8666-666666666666',
  })
  @ValidateIf(
    (dto: OutputScopeDto, value) =>
      value !== undefined || dto.scopeType === OutputScopeType.PROJECT,
  )
  @IsUUID(undefined, { message: 'id_uuid' })
  scopeProjectId?: string;
}

/**
 * The audiences a work may take, given its scope.
 *
 * A personal work has two: PRIVATE (the owner-only draft) and
 * FPTU_COMMUNITY. A container work has two: CONTAINER (the narrow audience
 * of the group or project) and FPTU_COMMUNITY. There is never a third
 * layer.
 */
export const outputAudiences = [
  OutputAudience.PRIVATE,
  OutputAudience.CONTAINER,
  OutputAudience.FPTU_COMMUNITY,
] as const;

/**
 * The audiences a work of the given scope may take.
 *
 * The client uses this to offer only the choices that the server would
 * accept, so the dialog never offers a layer that does not exist.
 */
export function allowedOutputAudiences(
  scopeType: OutputScopeType,
): readonly OutputAudience[] {
  return scopeType === OutputScopeType.PERSONAL
    ? [OutputAudience.PRIVATE, OutputAudience.FPTU_COMMUNITY]
    : [OutputAudience.CONTAINER, OutputAudience.FPTU_COMMUNITY];
}
