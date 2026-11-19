import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MAX_CHAT_ATTACHMENTS_PER_MESSAGE,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_CONVERSATION_TITLE_LENGTH,
  MAX_CHAT_MESSAGE_BODY_LENGTH,
} from '@researchos/chat';
import {
  ChatConversationType,
  ChatParticipantRole,
  ChatReceiptStatus,
} from '@researchos/database';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// ---------------------------------------------------------------------------
// Request & Query DTOs
// ---------------------------------------------------------------------------

export class ListChatConversationsQueryDto {
  @ApiPropertyOptional({
    description: 'Include archived conversations when true. Defaults to false.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  includeArchived?: boolean;
}

export class SearchChatUsersQueryDto {
  @ApiPropertyOptional({
    description: 'Search term matched against researcher name or email.',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of users returned.',
    type: 'integer',
    minimum: 1,
    maximum: 50,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class CreateChatConversationDto {
  @ApiProperty({
    description:
      'Conversation classification (`DIRECT` for 1-to-1, `GROUP` for multi-participant chat).',
    enum: ChatConversationType,
    enumName: 'ChatConversationType',
  })
  @IsEnum(ChatConversationType)
  type!: ChatConversationType;

  @ApiPropertyOptional({
    description: 'Optional display title for GROUP conversations.',
    type: 'string',
    maxLength: MAX_CHAT_CONVERSATION_TITLE_LENGTH,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CHAT_CONVERSATION_TITLE_LENGTH)
  title?: string | null;

  @ApiProperty({
    description:
      'Other user identifiers to include in the conversation alongside the creator.',
    type: [String],
    format: 'uuid',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  participantIds!: string[];
}

export class UpdateChatConversationDto {
  @ApiPropertyOptional({
    description: 'Updated conversation title (GROUP conversations).',
    type: 'string',
    maxLength: MAX_CHAT_CONVERSATION_TITLE_LENGTH,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CHAT_CONVERSATION_TITLE_LENGTH)
  title?: string | null;

  @ApiPropertyOptional({
    description: 'Archive (`true`) or unarchive (`false`) the conversation.',
  })
  @IsOptional()
  @IsBoolean()
  archived?: boolean;

  @ApiPropertyOptional({
    description: 'Mute or unmute notifications for the caller.',
  })
  @IsOptional()
  @IsBoolean()
  notificationMuted?: boolean;
}

export class AddChatParticipantDto {
  @ApiProperty({
    description: 'User identifier to add to the conversation.',
    format: 'uuid',
  })
  @IsUUID()
  userId!: string;

  @ApiPropertyOptional({
    description: 'Participant role in the conversation. Defaults to MEMBER.',
    enum: ChatParticipantRole,
    enumName: 'ChatParticipantRole',
  })
  @IsOptional()
  @IsEnum(ChatParticipantRole)
  role?: ChatParticipantRole;
}

export class ListChatMessagesQueryDto {
  @ApiPropertyOptional({
    description:
      'Message UUID cursor; returns messages created strictly before this message.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  beforeMessageId?: string;

  @ApiPropertyOptional({
    description: 'Number of messages to return (newest-first window).',
    type: 'integer',
    minimum: 1,
    maximum: 100,
    default: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class CreateChatUploadDto {
  @ApiProperty({
    description: 'File name without a directory path.',
    maxLength: 255,
  })
  @IsString()
  @Length(1, 255)
  @Matches(/^[^\\/\p{Cc}]+$/u)
  fileName!: string;

  @ApiProperty({
    description: 'MIME type of the compressed/final file sent with PUT.',
    example: 'image/webp',
  })
  @IsString()
  @Length(3, 100)
  @Matches(/^[\w.+-]+\/[\w.+-]+$/u)
  mimeType!: string;

  @ApiProperty({
    description: 'Final byte size of the object uploaded to S3.',
    type: 'integer',
    minimum: 1,
    maximum: MAX_CHAT_ATTACHMENT_BYTES,
  })
  @IsInt()
  @Min(1)
  @Max(MAX_CHAT_ATTACHMENT_BYTES)
  sizeBytes!: number;

  @ApiProperty({
    description: 'SHA-256 hex digest of the final uploaded bytes.',
    minLength: 64,
    maxLength: 64,
  })
  @IsString()
  @Matches(/^[a-f\d]{64}$/iu)
  sha256!: string;

  @ApiPropertyOptional({
    description: 'Pixel width for image attachments.',
    type: 'integer',
    minimum: 1,
    maximum: 16384,
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(16384)
  width?: number | null;

  @ApiPropertyOptional({
    description: 'Pixel height for image attachments.',
    type: 'integer',
    minimum: 1,
    maximum: 16384,
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(16384)
  height?: number | null;
}

export class ConfirmChatUploadDto {
  @ApiProperty({
    description:
      'Signed confirmation token returned when preparing the upload.',
  })
  @IsString()
  @Length(1, 4096)
  uploadToken!: string;
}

// ---------------------------------------------------------------------------
// Socket.IO Inbound Event Validation DTOs
// ---------------------------------------------------------------------------

export class ChatRoomSocketDto {
  @ApiProperty({
    description: 'Target conversation identifier.',
    format: 'uuid',
  })
  @IsUUID()
  conversationId!: string;
}

export class SendChatMessageSocketDto {
  @ApiProperty({
    description: 'Target conversation identifier.',
    format: 'uuid',
  })
  @IsUUID()
  conversationId!: string;

  @ApiProperty({
    description:
      'Message text body (may be empty only when attachments are present).',
    maxLength: MAX_CHAT_MESSAGE_BODY_LENGTH,
  })
  @IsString()
  @MaxLength(MAX_CHAT_MESSAGE_BODY_LENGTH)
  body!: string;

  @ApiPropertyOptional({
    description: 'Client-generated idempotency nonce for safe retry.',
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @Length(1, 128)
  clientNonce?: string;

  @ApiPropertyOptional({
    description:
      'Confirmed chat attachment identifiers to bind to this message.',
    type: [String],
    format: 'uuid',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CHAT_ATTACHMENTS_PER_MESSAGE)
  @IsUUID('4', { each: true })
  attachmentIds?: string[];
}

export class EditChatMessageSocketDto {
  @ApiProperty({
    description: 'Target conversation identifier.',
    format: 'uuid',
  })
  @IsUUID()
  conversationId!: string;

  @ApiProperty({
    description: 'Identifier of the message to edit.',
    format: 'uuid',
  })
  @IsUUID()
  messageId!: string;

  @ApiProperty({
    description: 'Updated message body.',
    maxLength: MAX_CHAT_MESSAGE_BODY_LENGTH,
  })
  @IsString()
  @MaxLength(MAX_CHAT_MESSAGE_BODY_LENGTH)
  body!: string;
}

export class DeleteChatMessageSocketDto {
  @ApiProperty({
    description: 'Target conversation identifier.',
    format: 'uuid',
  })
  @IsUUID()
  conversationId!: string;

  @ApiProperty({
    description: 'Identifier of the message to delete.',
    format: 'uuid',
  })
  @IsUUID()
  messageId!: string;
}

export class MarkChatReadSocketDto {
  @ApiProperty({
    description: 'Target conversation identifier.',
    format: 'uuid',
  })
  @IsUUID()
  conversationId!: string;

  @ApiProperty({
    description: 'Latest message identifier read by the caller.',
    format: 'uuid',
  })
  @IsUUID()
  messageId!: string;
}

export class MarkChatDeliveredSocketDto {
  @ApiProperty({
    description: 'Target conversation identifier.',
    format: 'uuid',
  })
  @IsUUID()
  conversationId!: string;

  @ApiProperty({
    description: 'Message identifiers delivered to the caller.',
    type: [String],
    format: 'uuid',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  messageIds!: string[];
}

export class ToggleChatReactionSocketDto {
  @ApiProperty({
    description: 'Target conversation identifier.',
    format: 'uuid',
  })
  @IsUUID()
  conversationId!: string;

  @ApiProperty({
    description: 'Identifier of the message receiving the reaction.',
    format: 'uuid',
  })
  @IsUUID()
  messageId!: string;

  @ApiProperty({
    description: 'Normalized reaction emoji.',
    maxLength: 32,
  })
  @IsString()
  @Length(1, 32)
  reaction!: string;
}

// ---------------------------------------------------------------------------
// Response DTOs (OpenAPI / Orval)
// ---------------------------------------------------------------------------

export class ChatUserSummaryDto {
  @ApiProperty({ description: 'User identifier.', format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Display full name of the user.' })
  fullName!: string;

  @ApiProperty({ description: 'Institutional email address.' })
  email!: string;

  @ApiProperty({ description: 'Department or academic unit.' })
  departmentUnit!: string;
}

export class ChatParticipantResponseDto {
  @ApiProperty({ description: 'Conversation identifier.', format: 'uuid' })
  conversationId!: string;

  @ApiProperty({ description: 'Participant user identifier.', format: 'uuid' })
  userId!: string;

  @ApiProperty({
    description: 'Participant role in the conversation.',
    enum: ChatParticipantRole,
    enumName: 'ChatParticipantRole',
  })
  role!: ChatParticipantRole;

  @ApiProperty({ description: 'ISO timestamp when the participant joined.' })
  joinedAt!: string;

  @ApiProperty({
    description: 'Last read message identifier, if any.',
    type: 'string',
    format: 'uuid',
    nullable: true,
  })
  lastReadMessageId!: string | null;

  @ApiProperty({
    description: 'Timestamp when the participant last marked a message read.',
    type: 'string',
    nullable: true,
  })
  lastReadAt!: string | null;

  @ApiProperty({
    description: 'Whether notifications are muted for this participant.',
  })
  notificationMuted!: boolean;

  @ApiProperty({
    description: 'Summary profile of the participant.',
    type: ChatUserSummaryDto,
  })
  user!: ChatUserSummaryDto;
}

export class ChatAttachmentResponseDto {
  @ApiProperty({ description: 'Attachment identifier.', format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Conversation identifier.', format: 'uuid' })
  conversationId!: string;

  @ApiProperty({
    description: 'Bound message identifier, or null before message creation.',
    type: 'string',
    format: 'uuid',
    nullable: true,
  })
  messageId!: string | null;

  @ApiProperty({
    description: 'User identifier who uploaded the attachment.',
    format: 'uuid',
  })
  uploadedBy!: string;

  @ApiProperty({ description: 'Original sanitized file name.' })
  fileName!: string;

  @ApiProperty({ description: 'Verified MIME content type.' })
  mimeType!: string;

  @ApiProperty({ description: 'Verified file size in bytes.', type: 'integer' })
  sizeBytes!: number;

  @ApiProperty({ description: 'Verified SHA-256 hex digest.' })
  sha256!: string;

  @ApiProperty({
    description: 'Image width in pixels, when applicable.',
    type: 'integer',
    nullable: true,
  })
  width!: number | null;

  @ApiProperty({
    description: 'Image height in pixels, when applicable.',
    type: 'integer',
    nullable: true,
  })
  height!: number | null;

  @ApiProperty({
    description: 'Whether the attachment can render inline as an image.',
  })
  isImage!: boolean;

  @ApiProperty({
    description: 'Authorized API download path (never a raw S3 key or URL).',
  })
  downloadPath!: string;

  @ApiProperty({ description: 'ISO timestamp when the upload was confirmed.' })
  createdAt!: string;
}

export class ChatUploadPreparedResponseDto {
  @ApiProperty({ description: 'Presigned S3 PUT URL for direct upload.' })
  uploadUrl!: string;

  @ApiProperty({
    description: 'Required HTTP headers to include on the PUT request.',
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  headers!: Record<string, string>;

  @ApiProperty({
    description: 'Signed confirmation token submitted after PUT succeeds.',
  })
  uploadToken!: string;
}

export class ChatMentionResponseDto {
  @ApiProperty({ description: 'Message identifier.', format: 'uuid' })
  messageId!: string;

  @ApiProperty({ description: 'Mentioned user identifier.', format: 'uuid' })
  mentionedUserId!: string;

  @ApiProperty({ description: 'Conversation identifier.', format: 'uuid' })
  conversationId!: string;

  @ApiProperty({ description: 'ISO timestamp of the mention.' })
  mentionedAt!: string;

  @ApiPropertyOptional({
    description: 'Summary of the mentioned user.',
    type: ChatUserSummaryDto,
  })
  user?: ChatUserSummaryDto;
}

export class ChatReactionSummaryDto {
  @ApiProperty({ description: 'Normalized emoji reaction.' })
  reaction!: string;

  @ApiProperty({
    description: 'Total participants who reacted with this emoji.',
    type: 'integer',
  })
  count!: number;

  @ApiProperty({
    description: 'User identifiers who reacted with this emoji.',
    type: [String],
    format: 'uuid',
  })
  userIds!: string[];
}

export class ChatReadReceiptDto {
  @ApiProperty({ description: 'Message identifier.', format: 'uuid' })
  messageId!: string;

  @ApiProperty({
    description: 'User identifier who read the message.',
    format: 'uuid',
  })
  userId!: string;

  @ApiProperty({ description: 'ISO timestamp when the message was read.' })
  readAt!: string;
}

export class ChatDeliveryReceiptDto {
  @ApiProperty({ description: 'Message identifier.', format: 'uuid' })
  messageId!: string;

  @ApiProperty({ description: 'Recipient user identifier.', format: 'uuid' })
  userId!: string;

  @ApiProperty({
    description: 'Delivery status for this recipient.',
    enum: ChatReceiptStatus,
    enumName: 'ChatReceiptStatus',
  })
  status!: ChatReceiptStatus;

  @ApiProperty({ description: 'ISO timestamp of the latest status update.' })
  updatedAt!: string;
}

export class ChatMessageResponseDto {
  @ApiProperty({ description: 'Message identifier.', format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Conversation identifier.', format: 'uuid' })
  conversationId!: string;

  @ApiProperty({ description: 'Sender user identifier.', format: 'uuid' })
  senderId!: string;

  @ApiPropertyOptional({
    description: 'Sender summary.',
    type: ChatUserSummaryDto,
  })
  sender?: ChatUserSummaryDto;

  @ApiProperty({ description: 'Message body text.' })
  body!: string;

  @ApiProperty({
    description: 'Optional client idempotency nonce.',
    type: 'string',
    nullable: true,
  })
  clientNonce!: string | null;

  @ApiProperty({
    description: 'Persisted user mentions on this message.',
    type: [ChatMentionResponseDto],
  })
  mentions!: ChatMentionResponseDto[];

  @ApiProperty({
    description: 'Aggregated emoji reactions on this message.',
    type: [ChatReactionSummaryDto],
  })
  reactions!: ChatReactionSummaryDto[];

  @ApiProperty({
    description: 'Confirmed file and image attachments.',
    type: [ChatAttachmentResponseDto],
  })
  attachments!: ChatAttachmentResponseDto[];

  @ApiProperty({
    description: 'Read receipts recorded for this message.',
    type: [ChatReadReceiptDto],
  })
  reads!: ChatReadReceiptDto[];

  @ApiProperty({
    description: 'Per-recipient delivery state receipts.',
    type: [ChatDeliveryReceiptDto],
  })
  receipts!: ChatDeliveryReceiptDto[];

  @ApiProperty({ description: 'ISO creation timestamp.' })
  createdAt!: string;

  @ApiProperty({
    description: 'ISO timestamp of the latest edit, if edited.',
    type: 'string',
    nullable: true,
  })
  editedAt!: string | null;

  @ApiProperty({
    description: 'ISO soft-deletion timestamp, if deleted.',
    type: 'string',
    nullable: true,
  })
  deletedAt!: string | null;

  @ApiProperty({
    description: 'User identifier who deleted the message, if deleted.',
    type: 'string',
    format: 'uuid',
    nullable: true,
  })
  deletedBy!: string | null;
}

export class ChatMessageHistoryResponseDto {
  @ApiProperty({
    description:
      'Ordered messages (oldest to newest within the requested page).',
    type: [ChatMessageResponseDto],
  })
  items!: ChatMessageResponseDto[];

  @ApiProperty({
    description:
      'Cursor (`beforeMessageId`) to fetch older messages, or null when at the beginning.',
    type: 'string',
    format: 'uuid',
    nullable: true,
  })
  nextBeforeMessageId!: string | null;

  @ApiProperty({
    description: 'Whether older messages exist before this page.',
  })
  hasMore!: boolean;
}

export class ChatConversationResponseDto {
  @ApiProperty({ description: 'Conversation identifier.', format: 'uuid' })
  id!: string;

  @ApiProperty({
    description: 'Conversation title (nullable for direct chats).',
    type: 'string',
    nullable: true,
  })
  title!: string | null;

  @ApiProperty({
    description: 'Conversation classification (`DIRECT` or `GROUP`).',
    enum: ChatConversationType,
    enumName: 'ChatConversationType',
  })
  type!: ChatConversationType;

  @ApiProperty({
    description: 'Creator user identifier.',
    format: 'uuid',
  })
  createdBy!: string;

  @ApiProperty({ description: 'ISO creation timestamp.' })
  createdAt!: string;

  @ApiProperty({ description: 'ISO last-activity timestamp.' })
  updatedAt!: string;

  @ApiProperty({
    description: 'ISO archive timestamp, or null when active.',
    type: 'string',
    nullable: true,
  })
  archivedAt!: string | null;

  @ApiProperty({
    description: 'Conversation participants.',
    type: [ChatParticipantResponseDto],
  })
  participants!: ChatParticipantResponseDto[];

  @ApiProperty({
    description: 'Latest message in the conversation, if any.',
    type: ChatMessageResponseDto,
    nullable: true,
  })
  lastMessage!: ChatMessageResponseDto | null;

  @ApiProperty({
    description: 'Unread message count for the caller.',
    type: 'integer',
  })
  unreadCount!: number;
}
