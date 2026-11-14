import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OutputFileVisibility } from '@researchos/database';
import { IsIn, IsUUID, ValidateIf } from 'class-validator';

/**
 * Changes who may see an already shared work.
 *
 * The affiliation (`accessGroupId`) records whose banner the work carries
 * while `visibility` alone decides who may read it, so a `FPTU_COMMUNITY`
 * work may keep its group. `RESEARCH_GROUP` still requires a group. Send
 * `accessGroupId: null` to clear the affiliation; omit it to keep the
 * stored one.
 */
export class UpdateOutputVisibilityDto {
  @ApiProperty({
    description:
      'Who may see the work. FPTU_COMMUNITY opens it to the whole ' +
      'FPTU community even when the work carries a group affiliation; ' +
      'RESEARCH_GROUP restricts it to the members of the access group.',
    enum: [
      OutputFileVisibility.FPTU_COMMUNITY,
      OutputFileVisibility.RESEARCH_GROUP,
    ],
    example: OutputFileVisibility.FPTU_COMMUNITY,
  })
  @IsIn(
    [OutputFileVisibility.FPTU_COMMUNITY, OutputFileVisibility.RESEARCH_GROUP],
    { message: 'visibility_invalid' },
  )
  visibility:
    | typeof OutputFileVisibility.FPTU_COMMUNITY
    | typeof OutputFileVisibility.RESEARCH_GROUP;

  @ApiPropertyOptional({
    description:
      'The affiliated research group whose banner the work carries. Required ' +
      'when visibility is RESEARCH_GROUP; optional when visibility is ' +
      'FPTU_COMMUNITY and rejected when visibility is PRIVATE. Send null ' +
      'to clear the affiliation; omit it to keep the stored one. The group ' +
      'must be one the caller is a member of.',
    format: 'uuid',
    nullable: true,
    example: '55555555-5555-4555-8555-555555555555',
  })
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsUUID('4', { message: 'access_group_id_invalid' })
  accessGroupId?: string | null;
}
