import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OutputFileVisibility } from '@researchos/database';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

/**
 * The visibility decision that accompanies a publish.
 *
 * `PRIVATE` is deliberately not accepted: publishing *is* the act of
 * sharing, so an unpublished work is the private state, not a publish
 * option. See `docs/database.md` §5.1.3.
 */
export class PublishOutputDto {
  @ApiProperty({
    description:
      'Who may see the published work. FPTU_COMMUNITY opens it to the whole ' +
      'FPTU community; RESEARCH_GROUP opens it to the members of the access group.',
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
      'FPTU_COMMUNITY and must be a group the caller is a member of.',
    format: 'uuid',
    example: '55555555-5555-4555-8555-555555555555',
  })
  @IsOptional()
  @IsUUID('4', { message: 'access_group_id_invalid' })
  accessGroupId?: string;
}
