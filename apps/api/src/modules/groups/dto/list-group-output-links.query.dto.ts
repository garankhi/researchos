import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

export class ListGroupOutputLinksQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Filter the showcase or review queue before pagination. PENDING requires group management permission.',
    enum: ['ACCEPTED', 'PENDING'],
  })
  @IsOptional()
  @IsIn(['ACCEPTED', 'PENDING'], { message: 'validation_failed' })
  status?: 'ACCEPTED' | 'PENDING';
}
