import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { ChatGateway } from './chat.gateway.js';
import { ChatService } from './chat.service.js';
import {
  AddChatParticipantDto,
  ChatConversationResponseDto,
  ChatMessageHistoryResponseDto,
  ChatParticipantResponseDto,
  ChatUserSummaryDto,
  CreateChatConversationDto,
  ListChatConversationsQueryDto,
  ListChatMessagesQueryDto,
  SearchChatUsersQueryDto,
  UpdateChatConversationDto,
} from './dto/chat.dto.js';

@ApiTags('chat')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'A valid session cookie is required.' })
@ApiTooManyRequestsResponse({
  description: 'The API request rate limit was exceeded.',
})
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
  ) {}

  @ApiOperation({
    summary: 'Search active users to start a chat conversation',
    description:
      'Returns active accounts matching the optional search query, excluding the caller.',
  })
  @ApiOkResponse({
    description: 'Matching active user summaries.',
    type: [ChatUserSummaryDto],
  })
  @ApiBadRequestResponse({ description: 'Invalid search query parameters.' })
  @Get('users')
  searchUsers(
    @CurrentUserId() userId: string,
    @Query() query: SearchChatUsersQueryDto,
  ): Promise<ChatUserSummaryDto[]> {
    return this.chatService.searchUsers(userId, query);
  }

  @ApiOperation({
    summary: 'List chat conversations for the authenticated caller',
    description:
      'Returns conversations where the caller is a participant, ordered by most recent activity.',
  })
  @ApiOkResponse({
    description:
      'Conversation summaries with participants, last message, and unread counts.',
    type: [ChatConversationResponseDto],
  })
  @ApiBadRequestResponse({ description: 'Invalid query parameters.' })
  @Get('conversations')
  listConversations(
    @CurrentUserId() userId: string,
    @Query() query: ListChatConversationsQueryDto,
  ): Promise<ChatConversationResponseDto[]> {
    return this.chatService.listConversations(
      userId,
      Boolean(query.includeArchived),
    );
  }

  @ApiOperation({
    summary: 'Create or reuse a chat conversation',
    description:
      'Creates a standalone DIRECT or GROUP chat conversation. Existing active 1-to-1 DIRECT conversations are reused.',
  })
  @ApiCreatedResponse({
    description: 'The created or existing conversation.',
    type: ChatConversationResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid conversation type, title, or participant list.',
  })
  @ApiNotFoundResponse({
    description: 'One or more target users do not exist or are inactive.',
  })
  @Post('conversations')
  async createConversation(
    @CurrentUserId() userId: string,
    @Body() dto: CreateChatConversationDto,
  ): Promise<ChatConversationResponseDto> {
    const conversation = await this.chatService.createConversation(userId, dto);
    await this.chatGateway.broadcastConversationToParticipants(
      conversation.id,
      conversation.participants.map((p) => p.userId),
    );
    return conversation;
  }

  @ApiOperation({
    summary: 'Get details of a chat conversation',
    description:
      'Returns conversation metadata, participants, latest message, and unread count for a participant.',
  })
  @ApiParam({
    name: 'conversationId',
    description: 'Identifier of the chat conversation.',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'The conversation details.',
    type: ChatConversationResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid conversation identifier.' })
  @ApiForbiddenResponse({
    description: 'The caller is not a participant in this conversation.',
  })
  @ApiNotFoundResponse({ description: 'The conversation does not exist.' })
  @Get('conversations/:conversationId')
  getConversation(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUserId() userId: string,
  ): Promise<ChatConversationResponseDto> {
    return this.chatService.getConversation(userId, conversationId);
  }

  @ApiOperation({
    summary: 'Update chat conversation settings',
    description:
      'Updates title or archived state (owners in group chats) or caller notification mute preference.',
  })
  @ApiParam({
    name: 'conversationId',
    description: 'Identifier of the chat conversation.',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'The updated conversation.',
    type: ChatConversationResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid update payload.' })
  @ApiForbiddenResponse({
    description: 'The caller cannot modify this conversation.',
  })
  @ApiNotFoundResponse({ description: 'The conversation does not exist.' })
  @Patch('conversations/:conversationId')
  async updateConversation(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUserId() userId: string,
    @Body() dto: UpdateChatConversationDto,
  ): Promise<ChatConversationResponseDto> {
    const updated = await this.chatService.updateConversation(
      userId,
      conversationId,
      dto,
    );
    await this.chatGateway.broadcastConversationToParticipants(
      updated.id,
      updated.participants.map((p) => p.userId),
    );
    return updated;
  }

  @ApiOperation({
    summary: 'Add a participant to a group chat conversation',
    description:
      'Adds an active user to a GROUP conversation. Requires OWNER role.',
  })
  @ApiParam({
    name: 'conversationId',
    description: 'Identifier of the group chat conversation.',
    format: 'uuid',
  })
  @ApiCreatedResponse({
    description: 'The newly added participant.',
    type: ChatParticipantResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid participant payload.' })
  @ApiForbiddenResponse({
    description: 'Only a group conversation owner may add participants.',
  })
  @ApiNotFoundResponse({
    description: 'Conversation or target user was not found.',
  })
  @ApiConflictResponse({
    description:
      'The user is already a participant or the conversation is archived.',
  })
  @Post('conversations/:conversationId/participants')
  async addParticipant(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUserId() userId: string,
    @Body() dto: AddChatParticipantDto,
  ): Promise<ChatParticipantResponseDto> {
    const added = await this.chatService.addParticipant(
      userId,
      conversationId,
      dto,
    );
    const conv = await this.chatService.getConversation(userId, conversationId);
    await this.chatGateway.broadcastConversationToParticipants(
      conversationId,
      conv.participants.map((p) => p.userId),
    );
    return added;
  }

  @ApiOperation({
    summary: 'Remove a participant from a group chat conversation',
    description:
      'Removes a participant (by an OWNER) or lets a member leave a GROUP conversation.',
  })
  @ApiParam({
    name: 'conversationId',
    description: 'Identifier of the group chat conversation.',
    format: 'uuid',
  })
  @ApiParam({
    name: 'participantId',
    description: 'User identifier of the participant to remove.',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'The removed participant record.',
    type: ChatParticipantResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid identifier.' })
  @ApiForbiddenResponse({
    description: 'The caller is not allowed to remove this participant.',
  })
  @ApiNotFoundResponse({
    description: 'Conversation or participant was not found.',
  })
  @ApiConflictResponse({
    description: 'Cannot remove the last owner of a group conversation.',
  })
  @Delete('conversations/:conversationId/participants/:participantId')
  async removeParticipant(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @CurrentUserId() userId: string,
  ): Promise<ChatParticipantResponseDto> {
    const removed = await this.chatService.removeParticipant(
      userId,
      conversationId,
      participantId,
    );
    const remaining = await this.chatService
      .assertParticipant(userId, conversationId)
      .then((res) => res.participantIds)
      .catch(() => []);
    if (remaining.length > 0) {
      await this.chatGateway.broadcastConversationToParticipants(
        conversationId,
        remaining,
      );
    }
    return removed;
  }

  @ApiOperation({
    summary: 'List persisted message history for a chat conversation',
    description:
      'Returns ordered messages with mentions, reactions, attachments, read receipts, and delivery states.',
  })
  @ApiParam({
    name: 'conversationId',
    description: 'Identifier of the chat conversation.',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Chronological message page and pagination cursor.',
    type: ChatMessageHistoryResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid query parameters.' })
  @ApiForbiddenResponse({
    description: 'The caller is not a participant in this conversation.',
  })
  @ApiNotFoundResponse({
    description: 'The conversation or cursor message does not exist.',
  })
  @Get('conversations/:conversationId/messages')
  listMessages(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUserId() userId: string,
    @Query() query: ListChatMessagesQueryDto,
  ): Promise<ChatMessageHistoryResponseDto> {
    return this.chatService.listMessages(userId, conversationId, query);
  }
}
