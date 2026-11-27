import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { OpenAlexWork } from './openalex.types.js';

/**
 * How long a fetched work list stays in the cache.
 *
 * The onboarding fetches an author's works once to show them, and the
 * finalize call needs the same works again to ingest the ones the
 * researcher decided on. The cache bridges those two calls so OpenAlex
 * is not asked for the same bibliography twice.
 *
 * It is deliberately short: the cache exists for one wizard session, not
 * as a general-purpose OpenAlex cache. A researcher who comes back
 * tomorrow gets fresh works.
 */
export const OPENALEX_WORKS_TTL_SECONDS = 30 * 60;

/**
 * The Redis-backed cache of the OpenAlex work lists.
 *
 * ## Why the cache exists
 *
 * The wizard shows the works OpenAlex holds for the researcher, and the
 * finalize call pulls the ones they decided on. Without a cache the
 * same paged listing is fetched from OpenAlex twice — once for the
 * preview and once for the pull — and the paged listing is the
 * expensive part, not the ingest.
 *
 * ## Why the key is the author id
 *
 * The key has to change when the researcher picks a different author in
 * step 2, or the stale list would be served for the new author. Keying
 * on the author id gives that for free: a different author is a
 * different entry, and re-picking the *same* author hits the entry that
 * is already there.
 *
 * ## Why a missing cache is not a failure
 *
 * Redis is an optimisation here, not a dependency. When it is absent —
 * or unreachable — the cache reads and writes become no-ops and the
 * wizard still works, it just fetches twice. The one thing that must
 * not happen is a failed write turning into a failed finalize, so every
 * cache error is logged and swallowed.
 */
@Injectable()
export class OpenAlexWorksCache implements OnModuleDestroy {
  private readonly logger = new Logger(OpenAlexWorksCache.name);
  private readonly redis: Redis | null;
  private readonly prefix: string;

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL')?.trim();
    this.prefix = `${config.get<string>('QUEUE_PREFIX') ?? 'researchos'}:openalex:works`;

    if (!url) {
      this.redis = null;
      this.logger.log(
        'REDIS_URL not set; the OpenAlex work cache is disabled and works are fetched twice.',
      );
      return;
    }

    try {
      this.redis = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        // A cache miss must never wait long: the caller falls back to a
        // live fetch rather than failing.
        connectTimeout: 2000,
        enableOfflineQueue: false,
      });
      this.redis.on('error', (error: Error) => {
        this.logger.warn(`OpenAlex work cache unavailable: ${error.message}`);
      });
    } catch (error) {
      this.redis = null;
      this.logger.warn(
        `OpenAlex work cache could not be created: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  /**
   * Reads a cached work list.
   *
   * Returns null on a miss and on any failure — a cache that cannot
   * answer is the same as a cache that has nothing.
   */
  async get(authorId: string): Promise<OpenAlexWork[] | null> {
    if (!this.redis) {
      return null;
    }

    try {
      const raw = await this.redis.get(this.key(authorId));
      if (!raw) {
        return null;
      }
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return null;
      }
      return parsed as OpenAlexWork[];
    } catch (error) {
      this.logger.warn(
        `OpenAlex work cache read failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return null;
    }
  }

  /**
   * Stores a work list.
   *
   * A failure is swallowed: the wizard still works, it just fetches
   * twice.
   */
  async set(authorId: string, works: OpenAlexWork[]): Promise<void> {
    if (!this.redis) {
      return;
    }

    try {
      await this.redis.set(
        this.key(authorId),
        JSON.stringify(works),
        'EX',
        OPENALEX_WORKS_TTL_SECONDS,
      );
    } catch (error) {
      this.logger.warn(
        `OpenAlex work cache write failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  /** Drops a cached work list, once the wizard is done with it. */
  async drop(authorId: string): Promise<void> {
    if (!this.redis) {
      return;
    }

    try {
      await this.redis.del(this.key(authorId));
    } catch (error) {
      this.logger.warn(
        `OpenAlex work cache delete failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.redis) {
      return;
    }
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }

  private key(authorId: string): string {
    return `${this.prefix}:${authorId}`;
  }
}
