import { ApiProperty } from '@nestjs/swagger';
import { ClaimStatus, OutputImportState } from '@researchos/database';

/**
 * The result of a candidate accept or reject decision (RES-141).
 *
 * Both actions are `POST` transitions, not `PATCH` field updates. The
 * payload names the work, its import state after the decision and the
 * caller's claim status: accept drives `CANDIDATE -> ACCEPTED` with the
 * caller as owner (or attaches to the existing owner when a co-author
 * already accepted), reject keeps `CANDIDATE` and records `REJECTED`.
 */
export class CandidateDecisionDto {
  @ApiProperty({
    description: 'Identifier of the decided candidate work.',
    format: 'uuid',
  })
  id: string;

  @ApiProperty({
    description:
      'Import state of the work after the decision. Accept moves a candidate to ACCEPTED; reject leaves it CANDIDATE.',
    enum: OutputImportState,
  })
  importState: OutputImportState;

  @ApiProperty({
    description:
      'Claim status of the caller after the decision: CONFIRMED for accept, REJECTED for reject.',
    enum: ClaimStatus,
  })
  claimStatus: ClaimStatus;

  @ApiProperty({
    description:
      'Owner of the work after the decision, or null when the work is still a candidate nobody owns.',
    type: String,
    format: 'uuid',
    nullable: true,
  })
  ownerId: string | null;
}
