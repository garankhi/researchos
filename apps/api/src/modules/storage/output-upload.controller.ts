import {
  Body,
  Controller,
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
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import {
  ConfirmOutputUploadDto,
  CreateOutputUploadDto,
  OutputFileResponseDto,
  OutputUploadResponseDto,
} from './dto/output-upload.dto.js';
import { OutputUploadService } from './output-upload.service.js';

@ApiTags('output-files')
@ApiCookieAuth()
@ApiBadRequestResponse({
  description: 'Invalid output ID, upload metadata, or confirmation token.',
})
@ApiUnauthorizedResponse({ description: 'A valid session cookie is required.' })
@ApiForbiddenResponse({
  description: 'The caller cannot manage this output or use this upload token.',
})
@ApiTooManyRequestsResponse({
  description: 'The API request rate limit was exceeded.',
})
@ApiServiceUnavailableResponse({
  description: 'Upload signing or object storage is unavailable.',
})
@ApiParam({
  name: 'outputId',
  description: 'Identifier of the parent research output.',
  format: 'uuid',
})
@Controller('outputs/:outputId/file-uploads')
export class OutputUploadController {
  constructor(private readonly uploads: OutputUploadService) {}

  @ApiOperation({
    summary: 'Prepare an output file upload',
    description:
      'Issues a presigned PUT URL and confirmation token to a user who can manage the output.',
  })
  @ApiCreatedResponse({
    description:
      'The upload URL, required request headers, and confirmation token.',
    type: OutputUploadResponseDto,
  })
  @Post()
  createUpload(
    @Param('outputId', ParseUUIDPipe) outputId: string,
    @CurrentUserId() userId: string,
    @Body() input: CreateOutputUploadDto,
  ): Promise<OutputUploadResponseDto> {
    return this.uploads.createUpload(userId, outputId, input);
  }

  @ApiOperation({
    summary: 'Confirm an output file upload',
    description:
      'Verifies the uploaded object and records its metadata. Repeating confirmation returns the same file.',
  })
  @ApiOkResponse({
    description: 'The confirmed output file.',
    type: OutputFileResponseDto,
  })
  @ApiConflictResponse({
    description: 'The object is missing or does not match the declared upload.',
  })
  @HttpCode(HttpStatus.OK)
  @Post('confirm')
  confirmUpload(
    @Param('outputId', ParseUUIDPipe) outputId: string,
    @CurrentUserId() userId: string,
    @Body() input: ConfirmOutputUploadDto,
  ): Promise<OutputFileResponseDto> {
    return this.uploads.confirmUpload(userId, outputId, input.uploadToken);
  }
}
