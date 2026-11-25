import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import { trimText } from '../../../common/dto/submitted-value.js';

export class UpdateArticleAbstractDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    description: 'Current release ID observed by the editor.',
  })
  @IsUUID(undefined, { message: 'id_uuid' })
  expectedRevisionId!: string;

  @ApiProperty({
    type: String,
    maxLength: 20_000,
    minLength: 1,
    description: 'The non-empty abstract to save on the Article.',
  })
  @Transform(trimText)
  @IsString({ message: 'abstract_invalid' })
  @IsNotEmpty({ message: 'abstract_invalid' })
  @MaxLength(20_000, { message: 'abstract_too_long' })
  abstract!: string;
}
