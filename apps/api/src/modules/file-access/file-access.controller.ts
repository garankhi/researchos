import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import {
  CreateFileAccessRequestDto,
  DecideFileAccessRequestDto,
  FileAccessRequestPageDto,
  FileAccessRequestResponseDto,
  ListFileAccessRequestsQueryDto,
} from './dto/file-access.dto.js';
import { FileAccessService } from './file-access.service.js';

/** A reader asks for one Private file of an Article they can view. */
@ApiTags('file-access')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'A valid session cookie is required.' })
@Controller('output-files')
export class FileAccessSubmitController {
  constructor(private readonly access: FileAccessService) {}

  @Post(':fileId/access-requests')
  @ApiOperation({
    summary: 'Request access to a Private file',
    description:
      'Sends a PENDING request to the Article owner. Sending again while a request is pending returns that request.',
  })
  @ApiParam({
    name: 'fileId',
    description: 'The requested file.',
    format: 'uuid',
  })
  @ApiCreatedResponse({
    description: 'The pending request.',
    type: FileAccessRequestResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid identifier or message, or the caller owns the file.',
  })
  @ApiNotFoundResponse({
    description:
      'The file does not exist or the caller cannot view its Article.',
  })
  @ApiConflictResponse({
    description:
      'The file is not an available Private file of the current release, or the caller can already download it.',
  })
  submit(
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Body() dto: CreateFileAccessRequestDto,
    @CurrentUserId() callerId: string,
  ): Promise<FileAccessRequestResponseDto> {
    return this.access.submit(callerId, fileId, dto);
  }
}

/** The requester's and the Article owner's view of requests. */
@ApiTags('file-access')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'A valid session cookie is required.' })
@ApiBadRequestResponse({ description: 'Invalid identifier or payload.' })
@Controller('file-access-requests')
export class FileAccessRequestsController {
  constructor(private readonly access: FileAccessService) {}

  @Get()
  @ApiOperation({
    summary: 'List file access requests',
    description:
      '`sent` lists the caller’s requests. `received` lists requests for Articles the caller currently manages.',
  })
  @ApiOkResponse({
    description: 'Paginated file access requests.',
    type: FileAccessRequestPageDto,
  })
  list(
    @Query() query: ListFileAccessRequestsQueryDto,
    @CurrentUserId() callerId: string,
  ): Promise<FileAccessRequestPageDto> {
    return this.access.list(callerId, query);
  }

  @Post(':requestId/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve a file access request',
    description:
      'Approves the request and grants access to that exact file. Approving an approved request again returns it unchanged.',
  })
  @ApiParam({ name: 'requestId', description: 'The request.', format: 'uuid' })
  @ApiOkResponse({
    description: 'The approved request with its grant.',
    type: FileAccessRequestResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'The requester cannot decide their own request.',
  })
  @ApiNotFoundResponse({
    description:
      'The request does not exist or the caller does not manage its Article.',
  })
  @ApiConflictResponse({
    description:
      'The request was already answered, the file is no longer requestable, or the requester can no longer view the Article.',
  })
  approve(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: DecideFileAccessRequestDto,
    @CurrentUserId() callerId: string,
  ): Promise<FileAccessRequestResponseDto> {
    return this.access.approve(callerId, requestId, dto);
  }

  @Post(':requestId/decline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Decline a file access request',
    description: 'Declining a declined request again returns it unchanged.',
  })
  @ApiParam({ name: 'requestId', description: 'The request.', format: 'uuid' })
  @ApiOkResponse({
    description: 'The declined request.',
    type: FileAccessRequestResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'The requester cannot decide their own request.',
  })
  @ApiNotFoundResponse({
    description:
      'The request does not exist or the caller does not manage its Article.',
  })
  @ApiConflictResponse({ description: 'The request was already answered.' })
  decline(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: DecideFileAccessRequestDto,
    @CurrentUserId() callerId: string,
  ): Promise<FileAccessRequestResponseDto> {
    return this.access.decline(callerId, requestId, dto);
  }

  @Post(':requestId/withdraw')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Withdraw a file access request',
    description:
      'Only the requester can withdraw, and only while it is pending.',
  })
  @ApiParam({ name: 'requestId', description: 'The request.', format: 'uuid' })
  @ApiOkResponse({
    description: 'The withdrawn request.',
    type: FileAccessRequestResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'The request does not exist or was not sent by the caller.',
  })
  @ApiConflictResponse({ description: 'The request was already answered.' })
  withdraw(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @CurrentUserId() callerId: string,
  ): Promise<FileAccessRequestResponseDto> {
    return this.access.withdraw(callerId, requestId);
  }
}

/** The Article owner withdraws access granted earlier. */
@ApiTags('file-access')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'A valid session cookie is required.' })
@ApiBadRequestResponse({ description: 'Invalid identifier.' })
@Controller('file-access-grants')
export class FileAccessGrantsController {
  constructor(private readonly access: FileAccessService) {}

  @Post(':grantId/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke access to a Private file',
    description:
      'Ends the grant at once. Revoking a revoked grant again returns it unchanged. A revoked grant is never restored.',
  })
  @ApiParam({ name: 'grantId', description: 'The grant.', format: 'uuid' })
  @ApiOkResponse({
    description: 'The request with its revoked grant.',
    type: FileAccessRequestResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'The grantee cannot revoke their own access.',
  })
  @ApiNotFoundResponse({
    description:
      'The grant does not exist or the caller does not manage its Article.',
  })
  revoke(
    @Param('grantId', ParseUUIDPipe) grantId: string,
    @CurrentUserId() callerId: string,
  ): Promise<FileAccessRequestResponseDto> {
    return this.access.revoke(callerId, grantId);
  }
}
