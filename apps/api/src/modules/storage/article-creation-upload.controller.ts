import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiGoneResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ArticleCreationUploadService } from './article-creation-upload.service.js';
import {
  ArticlePdfUploadResponseDto,
  ArticlePdfUploadStatusDto,
  CreateArticlePdfUploadDto,
} from './dto/article-creation-upload.dto.js';

@ApiTags('output-files')
@ApiCookieAuth()
@ApiBadRequestResponse({ description: 'Invalid PDF metadata or upload ID.' })
@ApiUnauthorizedResponse({ description: 'A valid session cookie is required.' })
@ApiForbiddenResponse({
  description: 'An active researcher account is required.',
})
@ApiTooManyRequestsResponse({
  description: 'The API request rate limit was exceeded.',
})
@Controller('outputs/creation-uploads')
@Roles('RESEARCHER')
export class ArticleCreationUploadController {
  constructor(private readonly uploads: ArticleCreationUploadService) {}

  @ApiOperation({ summary: 'Prepare a private Article PDF upload' })
  @ApiCreatedResponse({
    type: ArticlePdfUploadResponseDto,
    description: 'Upload session and signed PUT instructions.',
  })
  @ApiServiceUnavailableResponse({
    description: 'Upload signing is unavailable.',
  })
  @Post()
  createUpload(
    @CurrentUserId() ownerId: string,
    @Body() input: CreateArticlePdfUploadDto,
  ): Promise<ArticlePdfUploadResponseDto> {
    return this.uploads.createUpload(ownerId, input);
  }

  @ApiOperation({
    summary: 'Read an Article PDF upload and metadata processing status',
  })
  @ApiParam({
    name: 'uploadId',
    format: 'uuid',
    description: 'PDF upload session ID.',
  })
  @ApiOkResponse({
    type: ArticlePdfUploadStatusDto,
    description: 'Current upload and metadata processing state.',
  })
  @ApiNotFoundResponse({
    description: 'No upload with this ID belongs to the caller.',
  })
  @Header('Cache-Control', 'private, no-store')
  @Get(':uploadId')
  getUpload(
    @CurrentUserId() ownerId: string,
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
  ): Promise<ArticlePdfUploadStatusDto> {
    return this.uploads.getUpload(ownerId, uploadId);
  }

  @ApiOperation({ summary: 'Confirm an Article PDF upload' })
  @ApiParam({
    name: 'uploadId',
    format: 'uuid',
    description: 'PDF upload session ID.',
  })
  @ApiOkResponse({
    type: ArticlePdfUploadStatusDto,
    description: 'Verified or already attached PDF upload.',
  })
  @ApiNotFoundResponse({
    description: 'No upload with this ID belongs to the caller.',
  })
  @ApiConflictResponse({
    description:
      'The stored object is missing or differs from the declared PDF.',
  })
  @ApiGoneResponse({ description: 'The unclaimed PDF upload has expired.' })
  @ApiServiceUnavailableResponse({
    description: 'Object storage is unavailable.',
  })
  @HttpCode(HttpStatus.OK)
  @Post(':uploadId/confirm')
  confirmUpload(
    @CurrentUserId() ownerId: string,
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
  ): Promise<ArticlePdfUploadStatusDto> {
    return this.uploads.confirmUpload(ownerId, uploadId);
  }
}
