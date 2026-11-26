import { createHash } from 'node:crypto';
import type { QueueOptions } from 'bullmq';
import type { RedisOptions } from 'ioredis';

export const SYSTEM_QUEUE = 'system-checks';
export const PROBE_JOB = 'probe';
export const BACKGROUND_QUEUE = 'background-jobs';
export const NOTIFICATION_QUEUE = 'notification-jobs';

export function notificationRedisChannel(prefix: string): string {
  return `${prefix}:notification:created`;
}
export const DIGEST_QUEUE = 'digest-jobs';
export const TOPIC_SUGGESTION_QUEUE = 'topic-suggestion-jobs';
export const RESEARCH_UPDATES_QUEUE = 'research-updates';
export const ARTICLE_PDF_METADATA_QUEUE = 'article-pdf-metadata';
export const DEAD_LETTER_QUEUE = 'dead-letter-jobs';
export const DURABLE_PROBE_JOB = 'diagnostic-probe';
export const LLKH_EXPORT_JOB = 'llkh-export';
export const LLKH_FORMATS = ['docx', 'xlsx'] as const;
export type LlkhFormat = (typeof LLKH_FORMATS)[number];
export const LLKH_CONTENT_TYPES: Record<LlkhFormat, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
export const ARTICLE_PDF_METADATA_JOB = 'article-pdf-metadata';
export const MAX_ARTICLE_PDF_BYTES = 50 * 1024 * 1024;
export const DIGEST_SEND_JOB = 'digest-send';
export const TOPIC_SUGGESTION_JOB = 'topic-suggestion';
export const DIGEST_MAX_ATTEMPTS = 5;
export const JOB_ATTEMPTS = 3;

export function articlePdfMetadataScope(prefix: string): string {
  // The reserved database namespace is invisible to legacy outbox dispatchers.
  return `@article-pdf-metadata:${createHash('sha256').update(prefix).digest('hex')}`;
}

export interface ArticlePdfMetadata {
  title?: string;
  authorNames?: string[];
  abstract?: string;
  publicationDate?: string;
  doi?: string;
}

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function isJobUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

export function digestDeliveryId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object' || !('deliveryId' in payload)) {
    return undefined;
  }
  return isJobUuid(payload.deliveryId) ? payload.deliveryId : undefined;
}

export interface BackgroundJobPayload {
  jobId: string;
  generation: number;
}

export function isBackgroundJobPayload(
  value: unknown,
): value is BackgroundJobPayload {
  return (
    !!value &&
    typeof value === 'object' &&
    'jobId' in value &&
    isJobUuid(value.jobId) &&
    'generation' in value &&
    typeof value.generation === 'number' &&
    Number.isSafeInteger(value.generation) &&
    value.generation >= 0
  );
}

export function backgroundTransportId(
  jobId: string,
  generation: number,
): string {
  return `${jobId}-${generation}`;
}

export interface ProbePayload {
  requestId: string;
  /** Only this side-effect-free diagnostic job simulates retry failures. */
  failuresBeforeSuccess: number;
}

export interface ProbeResult {
  requestId: string;
  workerPid: number;
  attempt: number;
  processedAt: string;
}

/** Shared transport configuration; API and worker never import each other. */
export function createQueueOptions(
  redisUrl: string,
  prefix = 'researchos',
  role: 'producer' | 'worker' = 'producer',
): QueueOptions & { connection: RedisOptions } {
  let url: URL;
  try {
    url = new URL(redisUrl);
  } catch {
    throw new Error('REDIS_URL must be a valid redis:// or rediss:// URL');
  }

  if (!['redis:', 'rediss:'].includes(url.protocol) || !url.hostname) {
    throw new Error('REDIS_URL must use redis:// or rediss://');
  }

  const database = url.pathname.slice(1) || '0';
  if (!/^\d+$/.test(database) || !Number.isSafeInteger(Number(database))) {
    throw new Error('REDIS_URL database must be a non-negative integer');
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(prefix)) {
    throw new Error('QUEUE_PREFIX must contain only letters, digits, _ or -');
  }

  return {
    prefix,
    connection: {
      host: url.hostname.replace(/^\[|\]$/g, ''),
      port: Number(url.port || 6379),
      username: url.username ? decodeURIComponent(url.username) : undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
      db: Number(database),
      ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
      connectTimeout: 5_000,
      maxRetriesPerRequest: role === 'worker' ? null : 1,
      enableOfflineQueue: role === 'worker',
    },
    defaultJobOptions: {
      attempts: JOB_ATTEMPTS,
      backoff: { type: 'exponential', delay: 500 },
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 86400, count: 1000 },
    },
  };
}
