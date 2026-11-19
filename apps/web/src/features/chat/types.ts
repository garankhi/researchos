import type {
  ChatAttachmentPayload,
  ChatConversationSummaryPayload,
  ChatConversationTypeValue,
  ChatDeliveryReceiptPayload,
  ChatMentionPayload,
  ChatMessagePayload,
  ChatParticipantPayload,
  ChatParticipantRoleValue,
  ChatReactionSummaryPayload,
  ChatReadReceiptPayload,
  ChatUserSummary,
} from '@researchos/chat';

export type {
  ChatAttachmentPayload,
  ChatConversationSummaryPayload,
  ChatConversationTypeValue,
  ChatDeliveryReceiptPayload,
  ChatMentionPayload,
  ChatMessagePayload,
  ChatParticipantPayload,
  ChatParticipantRoleValue,
  ChatReactionSummaryPayload,
  ChatReadReceiptPayload,
  ChatUserSummary,
};

export type ChatConnectionStatus =
  'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export type LocalMessageSendState = 'sending' | 'sent' | 'failed';

export interface ChatUiMessage extends ChatMessagePayload {
  /** Present on optimistic client-created messages before/when sending fails. */
  localState?: LocalMessageSendState;
  localErrorCode?: string;
}

export interface PendingAttachmentItem {
  localId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  progress: number;
  status: 'compressing' | 'uploading' | 'confirming' | 'ready' | 'error';
  errorCode?: string;
  confirmed?: ChatAttachmentPayload;
}
