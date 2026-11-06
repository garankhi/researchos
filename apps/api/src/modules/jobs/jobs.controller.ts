import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUserId, Roles } from '../../common/decorators/index.js';
import { CreateProbeDto } from './dto/create-probe.dto.js';
import { JobDto } from './dto/job.dto.js';
import { JobStatusService } from './job-status.service.js';

const uuidPipe = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () => new BadRequestException(),
});

@ApiTags('jobs')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'A valid session is required.' })
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobStatusService) {}

  @Post('probes')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Submits an admin diagnostic job through the transactional outbox',
  })
  @ApiAcceptedResponse({
    description: 'Durably accepted; poll statusUrl.',
    type: JobDto,
  })
  @ApiForbiddenResponse({ description: 'Requires ADMIN.' })
  @ApiBadRequestResponse({ description: 'Invalid diagnostic parameters.' })
  @ApiConflictResponse({
    description: 'Idempotency key was already used with different input.',
  })
  create(
    @CurrentUserId() userId: string,
    @Body() dto: CreateProbeDto,
  ): Promise<JobDto> {
    return this.jobs.createProbe(userId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Returns the requesting user’s durable job status' })
  @ApiParam({
    name: 'id',
    description: 'Logical job UUID returned on submission.',
  })
  @ApiOkResponse({ description: 'Current durable status.', type: JobDto })
  @ApiBadRequestResponse({ description: 'Invalid job UUID.' })
  @ApiNotFoundResponse({
    description: 'Job is missing or belongs to another user.',
  })
  find(
    @CurrentUserId() userId: string,
    @Param('id', uuidPipe) id: string,
  ): Promise<JobDto> {
    return this.jobs.findOwned(userId, id);
  }

  @Post(':id/retry')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Reprocesses an owned failed job in a new bounded generation',
  })
  @ApiParam({ name: 'id', description: 'Failed logical job UUID.' })
  @ApiAcceptedResponse({
    description: 'Reprocessing accepted; poll statusUrl.',
    type: JobDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid job UUID.' })
  @ApiForbiddenResponse({
    description: 'Requires ADMIN; ownership is still required.',
  })
  @ApiNotFoundResponse({
    description: 'Job is missing or belongs to another user.',
  })
  @ApiConflictResponse({ description: 'Only failed jobs can be reprocessed.' })
  retry(
    @CurrentUserId() userId: string,
    @Param('id', uuidPipe) id: string,
  ): Promise<JobDto> {
    return this.jobs.retryOwned(userId, id);
  }
}
