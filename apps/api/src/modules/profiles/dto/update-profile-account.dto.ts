import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The account fields a researcher may correct on their own profile.
 *
 * These columns live on `users`, not on `researcher_profiles`: the name and
 * the academic title are institutional account attributes, so a researcher
 * has to be able to fix a typo in them without an administrator. They were
 * previously writable only through `PATCH /users/:id`, which is
 * ADMIN-only.
 *
 * `orcidId` is deliberately **not** here. It drives the OpenAlex ORCID
 * path, so it has to be verified rather than self-asserted — a researcher
 * who claims an ORCID that belongs to somebody else would pull another
 * person's bibliography.
 *
 * `email` and `userType` stay ADMIN-only: they are the account's identity
 * and its privilege level, not the researcher's own description.
 */
export class UpdateProfileAccountDto {
  @ApiPropertyOptional({
    description:
      'Full display name of the researcher. Required to be non-blank when sent.',
    example: 'PGS. TS. Nguyễn Văn A',
    maxLength: 255,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString({ message: 'full_name_invalid' })
  @IsNotEmpty({ message: 'full_name_required' })
  @MaxLength(255, { message: 'full_name_too_long' })
  fullName?: string;

  @ApiPropertyOptional({
    description:
      'Department or administrative unit. Required to be non-blank when sent.',
    example: 'Software Engineering',
    maxLength: 255,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString({ message: 'department_unit_invalid' })
  @IsNotEmpty({ message: 'department_unit_required' })
  @MaxLength(255, { message: 'department_unit_too_long' })
  departmentUnit?: string;

  @ApiPropertyOptional({
    description: 'Academic title; null clears the stored title.',
    example: 'PGS',
    type: String,
    nullable: true,
    maxLength: 100,
  })
  @IsOptional()
  @IsString({ message: 'academic_title_invalid' })
  @MaxLength(100, { message: 'academic_title_too_long' })
  academicTitle?: string | null;

  @ApiPropertyOptional({
    description: 'Academic degree; null clears the stored degree.',
    example: 'TS',
    type: String,
    nullable: true,
    maxLength: 100,
  })
  @IsOptional()
  @IsString({ message: 'academic_degree_invalid' })
  @MaxLength(100, { message: 'academic_degree_too_long' })
  academicDegree?: string | null;
}
