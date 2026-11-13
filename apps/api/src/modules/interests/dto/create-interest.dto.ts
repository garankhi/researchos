import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateInterestDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Active research topic to declare.',
  })
  @IsUUID()
  topicId: string;
}
