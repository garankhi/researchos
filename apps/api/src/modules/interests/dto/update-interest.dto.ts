import { ApiProperty } from '@nestjs/swagger';
import { interest_status } from '@researchos/database';
import { IsIn } from 'class-validator';

export class UpdateInterestDto {
  @ApiProperty({
    enum: interest_status,
    description:
      'Review decision: ACTIVE to accept/restore, REJECTED to reject. SUGGESTED is system-managed.',
  })
  @IsIn([interest_status.ACTIVE, interest_status.REJECTED])
  status: interest_status;
}
