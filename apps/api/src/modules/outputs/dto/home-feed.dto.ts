import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { OutputResponseDto } from './output-response.dto.js';

export class HomeFeedQueryDto extends PickType(PaginationQueryDto, ['limit']) {
  @ApiPropertyOptional({
    description:
      'The previous response’s meta.nextCursor. Omit for the first batch.',
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  cursor?: string;
}

export class HomeFeedMetaDto {
  @ApiProperty({
    description:
      'Total shared releases visible to the caller at the time of this request.',
    type: Number,
  })
  total: number;

  @ApiPropertyOptional({
    description:
      'Cursor for the next batch. Absent when no older eligible works remain.',
    type: String,
  })
  nextCursor?: string;
}

export class HomeFeedResponseDto {
  @ApiProperty({
    description:
      'Visible shared research outputs in this batch, newest shared first.',
    type: [OutputResponseDto],
  })
  items: OutputResponseDto[];

  @ApiProperty({
    description: 'The current total and continuation for the Home feed.',
    type: HomeFeedMetaDto,
  })
  meta: HomeFeedMetaDto;
}
