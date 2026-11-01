import type { QueueOptions } from 'bullmq';

export const SYSTEM_QUEUE = 'system-checks';
export const PROBE_JOB = 'probe';

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
): QueueOptions {
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
      attempts: 3,
      backoff: { type: 'exponential', delay: 500 },
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 86400, count: 1000 },
    },
  };
}
