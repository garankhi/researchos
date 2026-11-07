import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { OutputFileVisibility } from '@researchos/database';

export interface UploadIntent {
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

export function signUploadIntent(intent: UploadIntent): string {
  const payload = Buffer.from(JSON.stringify(intent)).toString('base64url');
  return `${payload}.${sign(payload).toString('base64url')}`;
}

export function readUploadIntent(token: string): UploadIntent {
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined) {
    throw new BadRequestException();
  }
  const expected = Buffer.from(sign(payload).toString('base64url'));
  const received = Buffer.from(signature);
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    throw new BadRequestException();
  }
  return JSON.parse(
    Buffer.from(payload, 'base64url').toString('utf8'),
  ) as UploadIntent;
}

function sign(payload: string): Buffer {
  const secret = process.env.S3_UPLOAD_TOKEN_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new ServiceUnavailableException();
  }
  return createHmac('sha256', secret).update(payload).digest();
}
