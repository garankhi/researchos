import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GroupOutputStatus } from '@researchos/database';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginatedResultDto } from '../../../common/dto/pagination.dto.js';

/**
 * Requests a link between a research output and a group.
 *
 * The revision is the released revision the group would pin. It must belong
 * to the output and be released — the database refuses anything else.
 */
export class CreateGroupOutputLinkDto {
  @ApiProperty({
    description: 'Research output to link into the group.',
    format: 'uuid',
  })
  @IsUUID()
  outputId: string;

  @ApiProperty({
    description:
      'Released revision of the output to pin; it must belong to the output.',
    format: 'uuid',
  })
  @IsUUID()
  revisionId: string;

  @ApiPropertyOptional({
    description: 'Note explaining the request to the group lead.',
    type: String,
    nullable: true,
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  decisionNote?: string | null;
}

/**
 * Accepts or rejects a pending group output link request.
 */
export class DecideGroupOutputLinkDto {
  @ApiProperty({
    description:
      'Decision to record: ACCEPTED pins the requested revision into the group, REJECTED declines it and preserves the previously accepted pin.',
    enum: [GroupOutputStatus.ACCEPTED, GroupOutputStatus.REJECTED],
  })
  @IsIn([GroupOutputStatus.ACCEPTED, GroupOutputStatus.REJECTED])
  status: GroupOutputStatus;

  @ApiPropertyOptional({
    description: 'Note recorded with the decision.',
    type: String,
    nullable: true,
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  decisionNote?: string | null;
}

/**
 * A group output link as the API returns it.
 *
 * The link is the group's own pin on a work: `requestedRevisionId` is what
 * the request asked for, `acceptedRevisionId` is what the group actually
 * shows. A pending or rejected request keeps the previous pin, so the two
 * can differ.
 */
export class GroupOutputLinkResponseDto {
  @ApiProperty({
    description: 'Research output linked to the group.',
    format: 'uuid',
  })
  outputId: string;

  @ApiProperty({
    description: 'Group holding the link.',
    format: 'uuid',
  })
  groupId: string;

  @ApiProperty({
    description: 'Link lifecycle state.',
    enum: GroupOutputStatus,
  })
  status: GroupOutputStatus;

  @ApiProperty({
    description: 'Revision the request asked the group to pin.',
    format: 'uuid',
  })
  requestedRevisionId: string;

  @ApiProperty({
    description: 'Researcher who requested the link.',
    format: 'uuid',
  })
  requestedBy: string;

  @ApiProperty({
    description: 'Timestamp of the request.',
    format: 'date-time',
  })
  requestedAt: string;

  @ApiProperty({
    description: 'Group lead who decided the request, if any.',
    type: String,
    format: 'uuid',
    nullable: true,
  })
  decidedBy: string | null;

  @ApiProperty({
    description: 'Timestamp of the decision, if any.',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  decidedAt: string | null;

  @ApiProperty({
    description: 'Note recorded with the request or the decision.',
    type: String,
    nullable: true,
  })
  decisionNote: string | null;

  @ApiProperty({
    description:
      'Revision the group currently pins, if any; null once the link is removed.',
    type: String,
    format: 'uuid',
    nullable: true,
  })
  acceptedRevisionId: string | null;

  @ApiProperty({
    description: 'Researcher who accepted the link, if any.',
    type: String,
    format: 'uuid',
    nullable: true,
  })
  acceptedBy: string | null;

  @ApiProperty({
    description: 'Timestamp of the acceptance, if any.',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  acceptedAt: string | null;

  @ApiProperty({
    description: 'Researcher who removed the link, if any.',
    type: String,
    format: 'uuid',
    nullable: true,
  })
  removedBy: string | null;

  @ApiProperty({
    description: 'Timestamp of the removal, if any.',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  removedAt: string | null;
}

/**
 * Paginated group output links.
 */
export class GroupOutputLinkPageDto extends PaginatedResultDto<GroupOutputLinkResponseDto> {
  @ApiProperty({
    description: 'Group output links in this page.',
    type: [GroupOutputLinkResponseDto],
  })
  declare items: GroupOutputLinkResponseDto[];
}
