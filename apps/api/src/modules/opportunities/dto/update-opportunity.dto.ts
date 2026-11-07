import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateOpportunityDto } from './create-opportunity.dto.js';

// Scope is immutable; status changes belong to the dedicated status actions.
export class UpdateOpportunityDto extends PartialType(
  OmitType(CreateOpportunityDto, ['groupId', 'projectId', 'status'] as const),
  { skipNullProperties: false },
) {}
