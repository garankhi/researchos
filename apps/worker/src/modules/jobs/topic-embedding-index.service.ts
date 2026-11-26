import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Prisma, PrismaService } from '@researchos/database';
import {
  decodeEmbedding,
  encodeEmbedding,
  topicEmbeddingText,
  TopicEmbeddingModel,
} from './topic-embedding-model.js';

const batchSize = 16;
const rebuildTimeoutMs = 60_000;
// Allow a full call, the isolation pass and its short health probe.
const claimLeaseMs = 150_000;
const maxInputFailures = 3;

type TopicClaim = {
  topic_id: string;
  pending_token: string;
};
type IndexedTopic = { id: string; vector: Float32Array };

@Injectable()
export class TopicEmbeddingIndexService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TopicEmbeddingIndexService.name);
  private timer?: ReturnType<typeof setTimeout>;
  private active?: Promise<void>;
  private stopping = false;
  private initialized = false;
  private snapshot?: { revision: bigint; topics: Promise<IndexedTopic[]> };

  constructor(
    private readonly prisma: PrismaService,
    private readonly model: TopicEmbeddingModel,
  ) {}

  onModuleInit(): void {
    if (this.model.version) this.schedule(0);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    clearTimeout(this.timer);
    await this.active;
  }

  private schedule(delay: number): void {
    if (this.stopping) return;
    this.timer = setTimeout(() => {
      this.active = this.maintain()
        .then((hadWork) => this.schedule(hadWork ? 100 : 3_000))
        .catch(() => {
          this.logger.warn('Topic suggestion maintenance failed. Will retry.');
          this.schedule(3_000);
        });
    }, delay);
    this.timer.unref();
  }

  async maintain(): Promise<boolean> {
    const version = this.model.version;
    if (!version) return false;
    if (!this.initialized) {
      await this.initialize(version);
      this.initialized = true;
    }
    const batch = await this.claimBatch(version);
    const refreshed =
      batch.length > 0 && (await this.refreshBatch(version, batch));

    // A model version first becomes usable once every initial row is indexed.
    await this.prisma.$executeRaw`
      UPDATE topic_embedding_indexes i SET ready = true
      WHERE i.version = ${version} AND NOT i.ready
        AND NOT EXISTS (
          SELECT 1 FROM topic_embeddings e
          WHERE e.index_version = i.version AND e.pending_token IS NOT NULL
        )
        AND (
          EXISTS (SELECT 1 FROM topic_embeddings e WHERE e.index_version = i.version AND e.vector IS NOT NULL)
          OR NOT EXISTS (SELECT 1 FROM topic_embeddings e WHERE e.index_version = i.version)
        )
    `;
    return refreshed;
  }

  async ready(): Promise<boolean> {
    const version = this.model.version;
    if (!version) return false;
    return !!(
      await this.prisma.topic_embedding_indexes.findUnique({
        where: { version },
        select: { ready: true },
      })
    )?.ready;
  }

  async rank(query: Float32Array): Promise<string[] | null> {
    const version = this.model.version;
    if (!version) return null;
    return (
      (await this.rankCurrentRevision(version, query)) ??
      (await this.rankCurrentRevision(version, query))
    );
  }

  private async rankCurrentRevision(
    version: string,
    query: Float32Array,
  ): Promise<string[] | null> {
    const index = await this.prisma.topic_embedding_indexes.findUnique({
      where: { version },
      select: { ready: true, revision: true },
    });
    if (!index?.ready) return null;
    const snapshot =
      this.snapshot?.revision === index.revision
        ? this.snapshot
        : { revision: index.revision, topics: this.loadVectors(version) };
    this.snapshot = snapshot;

    let topics: IndexedTopic[];
    try {
      topics = await snapshot.topics;
    } catch (error) {
      if (this.snapshot === snapshot) this.snapshot = undefined;
      throw error;
    }
    const ranked = rankTopicIds(query, topics);
    // The cache can outlive an edit/removal until the next completed batch.
    const active = ranked.length
      ? await this.prisma.$queryRaw<{ topic_id: string }[]>`
      SELECT e.topic_id
      FROM unnest(ARRAY[${Prisma.join(ranked)}]::uuid[]) WITH ORDINALITY r(topic_id, position)
      JOIN topic_embeddings e ON e.topic_id = r.topic_id AND e.index_version = ${version}
      JOIN research_topics t ON t.id = e.topic_id
      WHERE e.vector IS NOT NULL AND t.is_active
      ORDER BY r.position LIMIT 5
    `
      : [];
    const current = await this.prisma.topic_embedding_indexes.findUnique({
      where: { version },
      select: { revision: true },
    });
    return current?.revision === index.revision
      ? active.map(({ topic_id }) => topic_id)
      : null;
  }

  private async loadVectors(version: string): Promise<IndexedTopic[]> {
    const rows = await this.prisma.topic_embeddings.findMany({
      where: { index_version: version, vector: { not: null } },
      select: { topic_id: true, vector: true },
    });
    return rows.flatMap(({ topic_id, vector }) =>
      vector ? [{ id: topic_id, vector: decodeEmbedding(vector) }] : [],
    );
  }

  private async initialize(version: string): Promise<void> {
    const exists = await this.prisma.topic_embedding_indexes.findUnique({
      where: { version },
      select: { version: true },
    });
    if (exists) return;

    await this.prisma.$transaction(async (tx) => {
      // Serialize the initial snapshot with Topic writes. Later changes are covered
      // by the trigger once this version is visible to those write transactions.
      await tx.$executeRaw`LOCK TABLE research_topics IN SHARE MODE`;
      const created = await tx.$executeRaw`
        INSERT INTO topic_embedding_indexes (version) VALUES (${version})
        ON CONFLICT DO NOTHING
      `;
      if (created)
        await tx.$executeRaw`
        INSERT INTO topic_embeddings (index_version, topic_id)
        SELECT ${version}, id FROM research_topics WHERE is_active
      `;
    });
  }

  private claimBatch(version: string): Promise<TopicClaim[]> {
    // Lease only pending rows. A crashed worker leaves them eligible again.
    return this.prisma.$queryRaw<TopicClaim[]>`
      WITH batch AS (
        SELECT topic_id
        FROM topic_embeddings
        WHERE index_version = ${version}
          AND pending_token IS NOT NULL AND next_attempt_at <= now()
        ORDER BY next_attempt_at, topic_id LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE topic_embeddings e
      SET next_attempt_at = now() + ${claimLeaseMs} * interval '1 millisecond',
          pending_token = gen_random_uuid()
      FROM batch b
      WHERE e.index_version = ${version} AND e.topic_id = b.topic_id
      RETURNING e.topic_id, e.pending_token
    `;
  }

  private async refreshBatch(
    version: string,
    claims: TopicClaim[],
  ): Promise<boolean> {
    // Read from a fresh snapshot after claiming. Under READ COMMITTED the
    // locking statement can see a newer claim row than a Topic joined to it.
    const batch = await this.prisma.topic_embeddings.findMany({
      where: { index_version: version, OR: claims },
      select: {
        topic_id: true,
        pending_token: true,
        failed_attempts: true,
        topic: { select: { name: true, description: true } },
      },
    });
    if (!batch.length) return false;
    const inputs = batch.map(({ topic: { name, description } }) =>
      topicEmbeddingText(name, description),
    );
    let vectors: Awaited<ReturnType<TopicEmbeddingModel['embedTopics']>>;
    try {
      vectors = await this.model.embedTopics(inputs, rebuildTimeoutMs);
    } catch {
      this.logger.warn(
        'Topic embedding batch unavailable. Pending rows will be retried.',
      );
      return false;
    }

    await this.prisma.$transaction(async (tx) => {
      let changed = false;
      for (const [position, topic] of batch.entries()) {
        const vector = vectors[position];
        if (vector === undefined) continue;
        const failures = topic.failed_attempts + 1;
        // A concurrent edit replaces the token, so this worker cannot publish
        // a vector generated from superseded text.
        const result = await tx.topic_embeddings.updateMany({
          where: {
            index_version: version,
            topic_id: topic.topic_id,
            pending_token: topic.pending_token,
          },
          data: vector
            ? {
                vector: encodeEmbedding(vector),
                pending_token: null,
                failed_attempts: 0,
              }
            : {
                failed_attempts: failures,
                ...(failures >= maxInputFailures
                  ? { pending_token: null }
                  : {}),
              },
        });
        if (result.count && !vector && failures >= maxInputFailures) {
          this.logger.warn(
            `Topic ${topic.topic_id} could not be embedded after ${failures} attempts for ${version}`,
          );
        }
        changed ||= !!vector && result.count > 0;
      }
      if (changed)
        await tx.topic_embedding_indexes.update({
          where: { version },
          data: { revision: { increment: 1n } },
        });
    });
    return true;
  }
}

export function rankTopicIds(
  query: Float32Array,
  topics: IndexedTopic[],
): string[] {
  return topics
    .map(({ id, vector }) => {
      let similarity = 0;
      for (let i = 0; i < query.length; i += 1)
        similarity += query[i]! * vector[i]!;
      return { id, similarity };
    })
    .sort((a, b) => b.similarity - a.similarity || a.id.localeCompare(b.id))
    .map(({ id }) => id);
}
