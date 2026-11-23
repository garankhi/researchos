import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@researchos/database';
import {
  isBackgroundJobPayload,
  TOPIC_SUGGESTION_JOB,
  TOPIC_SUGGESTION_QUEUE,
  type BackgroundJobPayload,
} from '@researchos/queue';
import { Job, UnrecoverableError } from 'bullmq';
import { TopicEmbeddingIndexService } from '../modules/jobs/topic-embedding-index.service.js';
import {
  articleEmbeddingText,
  TopicEmbeddingModel,
} from '../modules/jobs/topic-embedding-model.js';

@Processor(TOPIC_SUGGESTION_QUEUE, { concurrency: 2, autorun: false })
export class TopicSuggestionProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly queuePrefix: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly model: TopicEmbeddingModel,
    private readonly index: TopicEmbeddingIndexService,
    config: ConfigService,
  ) {
    super();
    this.queuePrefix = config.get<string>('QUEUE_PREFIX') ?? 'researchos';
  }

  onApplicationBootstrap(): void {
    if (this.model.version) {
      void this.worker
        .run()
        .catch(() =>
          new Logger(TopicSuggestionProcessor.name).error(
            'Topic suggestion queue stopped',
          ),
        );
    }
  }

  async process(job: Job<BackgroundJobPayload>): Promise<void> {
    if (!isBackgroundJobPayload(job.data)) {
      throw new UnrecoverableError('Invalid Topic suggestion job reference');
    }
    const { jobId, generation } = job.data;
    const stored = await this.prisma.background_jobs.findFirst({
      where: {
        id: jobId,
        generation,
        kind: TOPIC_SUGGESTION_JOB,
        queue_prefix: this.queuePrefix,
        status: 'PENDING',
      },
      select: { topic_suggestion_request: true },
    });
    if (!stored) return;
    const request = stored.topic_suggestion_request;
    if (!request)
      throw new UnrecoverableError('Topic suggestion request is missing');

    let topicIds: string[] | null = null;
    if (
      request.status === 'pending' &&
      request.title &&
      request.deadline_at.getTime() > Date.now()
    ) {
      topicIds = await this.suggest(
        request.title,
        request.abstract,
        request.deadline_at,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const available = topicIds !== null && request.deadline_at > now;
      await tx.topic_suggestion_requests.updateMany({
        where: { job_id: jobId, status: 'pending' },
        data: {
          status: available ? 'ready' : 'unavailable',
          topic_ids: available ? topicIds! : [],
          title: null,
          abstract: null,
        },
      });
      await tx.background_jobs.updateMany({
        where: { id: jobId, generation, status: 'PENDING' },
        data: { status: 'COMPLETED', updated_at: now },
      });
    });
  }

  private async suggest(
    title: string,
    abstract: string | null,
    deadline: Date,
  ): Promise<string[] | null> {
    if (!(await this.index.ready())) return null;
    const remainingMs = deadline.getTime() - Date.now();
    if (remainingMs <= 0) return null;
    try {
      const query = await this.model.embedArticle(
        articleEmbeddingText(title, abstract),
        Math.min(remainingMs, 4_000),
      );
      if (query) return this.index.rank(query);
    } catch {
      return null;
    }

    return null;
  }
}
