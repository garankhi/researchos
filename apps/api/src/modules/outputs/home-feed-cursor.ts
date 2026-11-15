import { BadRequestException } from '@nestjs/common';
import { isISO8601, isUUID } from 'class-validator';

export interface HomeFeedCursor {
  sharedAt: string;
  id: string;
}

const utcTimestamp = /^(?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u;

export function parseHomeFeedCursor(value: string): HomeFeedCursor {
  const [sharedAt, id, extra] = value.split('~');
  if (
    extra !== undefined ||
    !utcTimestamp.test(sharedAt) ||
    !isISO8601(sharedAt, { strict: true }) ||
    !isUUID(id)
  ) {
    throw new BadRequestException('validation_failed');
  }
  return { sharedAt, id };
}

export function formatHomeFeedCursor({ sharedAt, id }: HomeFeedCursor): string {
  return `${sharedAt}~${id}`;
}
