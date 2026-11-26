import { ApiProperty } from '@nestjs/swagger';
import { OutputAudience } from '@researchos/database';
import { IsIn } from 'class-validator';

/**
 * Changes who may see an already shared work.
 *
 * The audience follows the scope of the work, and only the container
 * managers may change it: the owner of a personal work, the leads of the
 * group of a group work, or the project lead and the parent group leads
 * of a project work. The poster of a container work may not: the container
 * owns the post.
 *
 * The audience is the only thing that changes. The scope is fixed at
 * creation, and the affiliation (`accessGroupId`) records whose banner
 * the work carries - it grants no authority.
 */
export class UpdateOutputVisibilityDto {
  @ApiProperty({
    description:
      'Who may see the work. PRIVATE is the owner-only draft and is only ' +
      'offered for a personal work. CONTAINER restricts it to the members ' +
      'of the group or the project and is only offered for a container ' +
      'work. FPTU_COMMUNITY opens it to every signed-in researcher.',
    enum: [
      OutputAudience.PRIVATE,
      OutputAudience.CONTAINER,
      OutputAudience.FPTU_COMMUNITY,
    ],
    example: OutputAudience.FPTU_COMMUNITY,
  })
  @IsIn(
    [
      OutputAudience.PRIVATE,
      OutputAudience.CONTAINER,
      OutputAudience.FPTU_COMMUNITY,
    ],
    { message: 'output_visibility_invalid' },
  )
  audience: OutputAudience;
}
