import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OutputAudience } from '@researchos/database';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

/**
 * The audience decision that accompanies a publish.
 *
 * `PRIVATE` is deliberately not accepted: publishing *is* the act of
 * sharing, so an unpublished work is the private state, not a publish
 * option.
 *
 * The audience follows the scope of the work. A personal work is published
 * to the community; a container work is published to its container, or to
 * the community when the container leads choose that.
 */
export class PublishOutputDto {
  @ApiProperty({
    description:
      'Who may see the published work. CONTAINER opens it to the members of ' +
      'the group or the project, and is only valid for a container work. ' +
      'FPTU_COMMUNITY opens it to the whole FPTU community.',
    enum: [OutputAudience.CONTAINER, OutputAudience.FPTU_COMMUNITY],
    example: OutputAudience.FPTU_COMMUNITY,
  })
  @IsIn([OutputAudience.CONTAINER, OutputAudience.FPTU_COMMUNITY], {
    message: 'output_visibility_invalid',
  })
  audience:
    typeof OutputAudience.CONTAINER | typeof OutputAudience.FPTU_COMMUNITY;

  @ApiPropertyOptional({
    description:
      'The affiliated research group whose banner the work carries. Display ' +
      'information only: it grants no authority over the work. Must be a ' +
      'group the caller is a member of.',
    format: 'uuid',
    example: '55555555-5555-4555-8555-555555555555',
  })
  @IsOptional()
  @IsUUID(undefined, { message: 'access_group_id_invalid' })
  accessGroupId?: string;
}
