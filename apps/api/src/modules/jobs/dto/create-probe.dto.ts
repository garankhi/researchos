import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class CreateProbeDto {
  @ApiProperty({
    description:
      'Caller-generated UUID; repeated submissions by this owner reuse the job.',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'id_uuid' })
  idempotencyKey!: string;

  @ApiPropertyOptional({
    description:
      'Diagnostic failures before success in generation zero; 3 exhausts the bounded retry policy.',
    minimum: 0,
    maximum: 3,
    default: 0,
  })
  @IsOptional()
  @IsInt({ message: 'failures_before_success_integer' })
  @Min(0, { message: 'failures_before_success_min' })
  @Max(3, { message: 'failures_before_success_max' })
  failuresBeforeSuccess?: number;
}
