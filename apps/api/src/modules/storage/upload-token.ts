import { createHmac, timingSafeEqual } from 'node:crypto';
import { HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { domainErrorCodes } from '@researchos/error-codes';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import type { OutputFileVisibility } from '@researchos/database';

export interface UploadIntent {
  kind?: 'output';
  userId: string;
  outputId: string;
  key: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  visibility: OutputFileVisibility;
  accessGroupId: string | null;
  expiresAt: number;
}

export interface ChatUploadIntent {
  kind: 'chat';
  userId: string;
  conversationId: string;
  key: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  width: number | null;
  height: number | null;
  expiresAt: number;
}

export type SignedUploadIntent = UploadIntent | ChatUploadIntent;

export function signUploadIntent(intent: SignedUploadIntent): string {
  const payload = Buffer.from(JSON.stringify(intent)).toString('base64url');
  return `${payload}.${sign(payload).toString('base64url')}`;
}

function decodeAndVerifyUploadIntent(token: string): SignedUploadIntent {
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined) {
    throw new CodedHttpException(
      domainErrorCodes.storage.uploadIntentInvalid,
      HttpStatus.BAD_REQUEST,
    );
  }
  const expected = Buffer.from(sign(payload).toString('base64url'));
  const received = Buffer.from(signature);
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    throw new CodedHttpException(
      domainErrorCodes.storage.uploadIntentInvalid,
      HttpStatus.BAD_REQUEST,
    );
  }
  return JSON.parse(
    Buffer.from(payload, 'base64url').toString('utf8'),
  ) as SignedUploadIntent;
}

export function readUploadIntent(token: string): UploadIntent {
  const parsed = decodeAndVerifyUploadIntent(token);
  if (parsed.kind === 'chat') {
    throw new CodedHttpException(
      domainErrorCodes.storage.uploadIntentInvalid,
      HttpStatus.BAD_REQUEST,
    );
  }
  return parsed;
}

export function readChatUploadIntent(token: string): ChatUploadIntent {
  const parsed = decodeAndVerifyUploadIntent(token);
  if (parsed.kind !== 'chat') {
    throw new CodedHttpException(
      domainErrorCodes.storage.uploadIntentInvalid,
      HttpStatus.BAD_REQUEST,
    );
  }
  return parsed;
}

function sign(payload: string): Buffer {
  const secret = process.env.S3_UPLOAD_TOKEN_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new ServiceUnavailableException();
  }
  return createHmac('sha256', secret).update(payload).digest();
}
