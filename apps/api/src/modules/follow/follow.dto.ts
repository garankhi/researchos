import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { PaginatedResultDto } from '../../common/dto/pagination.dto.js';

export enum FollowEntityType {
  RESEARCHER = 'RESEARCHER',
  GROUP = 'GROUP',
  PROJECT = 'PROJECT',
  TOPIC = 'TOPIC',
  OUTPUT = 'OUTPUT',
}

export class FollowTargetDto {
  @IsEnum(FollowEntityType)
  @ApiProperty({
    enum: FollowEntityType,
    enumName: 'FollowEntityType',
    description: 'Type of the target. PROJECT and OUTPUT are reserved.',
  })
  entityType!: FollowEntityType;

  @ApiProperty({ format: 'uuid', description: 'ID of the target entity.' })
  @IsUUID()
  entityId!: string;
}

export class FollowDto extends FollowTargetDto {
  @ApiProperty({
    format: 'date-time',
    description: 'When the follow was created.',
  })
  followedAt!: string;

  @ApiProperty({ description: 'Current display name of the followed entity.' })
  displayName!: string;

  @ApiProperty({
    description: 'Researcher availability or ACTIVE for a group or topic.',
  })
  state!: string;
}

export class PaginatedFollowsDto extends PaginatedResultDto<FollowDto> {
  @ApiProperty({
    type: [FollowDto],
    description: 'Visible follows on this page.',
  })
  declare items: FollowDto[];
}
