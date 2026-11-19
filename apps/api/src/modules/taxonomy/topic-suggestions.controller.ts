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
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import {
  RequestTopicSuggestionsDto,
  TopicSuggestionRequestDto,
  TopicSuggestionStatusDto,
} from './dto/topic-suggestions.dto.js';
import { TopicSuggestionsService } from './topic-suggestions.service.js';

@ApiTags('taxonomy')
@ApiCookieAuth()
@ApiBadRequestResponse({
  description: 'Invalid title, abstract, or request ID.',
})
@ApiUnauthorizedResponse({ description: 'A valid session cookie is required.' })
@ApiTooManyRequestsResponse({ description: 'The API rate limit was exceeded.' })
@Controller('taxonomy/topic-suggestions')
export class TopicSuggestionsController {
  constructor(private readonly suggestions: TopicSuggestionsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Request Topic suggestions for an Article draft' })
  @ApiAcceptedResponse({
    type: TopicSuggestionRequestDto,
    description: 'Suggestion request accepted.',
  })
  request(
    @CurrentUserId() ownerId: string,
    @Body() input: RequestTopicSuggestionsDto,
  ) {
    return this.suggestions.request(ownerId, input);
  }

  @Get(':requestId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read the Article Topic suggestion result' })
  @ApiParam({
    name: 'requestId',
    format: 'uuid',
    description: 'Suggestion request ID.',
  })
  @ApiOkResponse({
    type: TopicSuggestionStatusDto,
    description: 'Current suggestion status and results.',
  })
  @ApiNotFoundResponse({
    description: 'No unexpired request with this ID belongs to the caller.',
  })
  get(
    @CurrentUserId() ownerId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ) {
    return this.suggestions.get(ownerId, requestId);
  }
}
