import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { BackgroundJobsService } from '@researchos/database';
import {
  LLKH_EXPORT_JOB,
  LLKH_FORMATS,
  type LlkhFormat,
} from '@researchos/queue';
import { IsIn, ValidateIf } from 'class-validator';
import { CurrentUserId } from '../../common/decorators/index.js';
import { ObjectStorageService } from '../storage/object-storage.service.js';

class CreateLlkhDto {
  @ApiPropertyOptional({
    enum: [...LLKH_FORMATS],
    default: 'docx',
    description: 'File format for the scientific CV.',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(LLKH_FORMATS)
  format?: LlkhFormat;
}

class LlkhAcceptedDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Durable export job ID to poll.',
  })
  jobId!: string;
  @ApiProperty({ description: 'Current state of the durable export job.' })
  status!: string;
}

class LlkhDownloadDto {
  @ApiProperty({
    description: 'Signed storage URL that expires in 15 minutes.',
  })
  downloadUrl!: string;
  @ApiProperty({ description: 'Suggested filename for the download.' })
  fileName!: string;
  @ApiProperty({
    enum: [1, 2],
    description: '1 for the fallback summary and 2 for the formatted CV.',
  })
  exportLevel!: number;
}

@ApiCookieAuth()
@ApiTags('exports')
@ApiUnauthorizedResponse({ description: 'A valid session is required.' })
@Controller('exports')
export class LlkhExportsController {
  constructor(
    @Inject(BackgroundJobsService) private readonly jobs: BackgroundJobsService,
    @Inject(ObjectStorageService)
    private readonly storage: ObjectStorageService,
  ) {}

  @Post('llkh')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Queues a scientific CV export for the current user',
  })
  @ApiHeader({
    name: 'idempotency-key',
    required: false,
    description:
      'Reuses the same job for repeated requests with the same format.',
  })
  @ApiAcceptedResponse({
    type: LlkhAcceptedDto,
    description: 'The export job was durably accepted.',
  })
  @ApiBadRequestResponse({ description: 'Invalid format or idempotency key.' })
  @ApiConflictResponse({
    description:
      'The idempotency key was previously used with a different format.',
  })
  async create(
    @CurrentUserId() ownerId: string,
    @Body() dto: CreateLlkhDto,
    @Headers('idempotency-key') key?: string,
  ): Promise<LlkhAcceptedDto> {
    if (key !== undefined && (!key.trim() || key.length > 200)) {
      throw new BadRequestException();
    }
    const job = await this.jobs.submit(
      ownerId,
      LLKH_EXPORT_JOB,
      key ?? randomUUID(),
      {
        format: dto?.format ?? 'docx',
      },
    );
    return { jobId: job.id, status: job.status };
  }

  @Get('download/:jobId')
  @ApiOperation({
    summary: 'Signs a download URL for a completed scientific CV export',
  })
  @ApiParam({
    name: 'jobId',
    description: 'Durable ID of the submitted export job.',
  })
  @ApiOkResponse({
    type: LlkhDownloadDto,
    description: 'The file is ready to download.',
  })
  @ApiForbiddenResponse({ description: 'The job belongs to another account.' })
  @ApiNotFoundResponse({ description: 'The export job could not be found.' })
  @ApiConflictResponse({ description: 'The export job has no completed file.' })
  async download(
    @CurrentUserId() ownerId: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ): Promise<LlkhDownloadDto> {
    const job = await this.jobs.findAccessible(ownerId, jobId);
    if (job.owner_id !== ownerId || job.kind !== LLKH_EXPORT_JOB) {
      throw new NotFoundException();
    }
    const result = job.result as {
      fileKey?: unknown;
      format?: unknown;
      exportLevel?: unknown;
    } | null;
    if (
      job.status !== 'COMPLETED' ||
      typeof result?.fileKey !== 'string' ||
      (result.format !== 'docx' && result.format !== 'xlsx') ||
      (result.exportLevel !== 1 && result.exportLevel !== 2)
    ) {
      throw new ConflictException();
    }
    const fileName = `LLKH.${result.format}`;
    const fileKey = result.fileKey;
    const downloadUrl = await this.storage.run((storage) =>
      storage.createDownloadUrl(fileKey, fileName),
    );
    return { downloadUrl, fileName, exportLevel: result.exportLevel };
  }
}
