import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { BackgroundJobsService, PrismaService } from '@researchos/database';
import { TOPIC_SUGGESTION_JOB } from '@researchos/queue';
import type {
  RequestTopicSuggestionsDto,
  TopicSuggestionRequestDto,
  TopicSuggestionStatusDto,
} from './dto/topic-suggestions.dto.js';

const processingWindowMs = 15_000;
const resultLifetimeMs = 10 * 60_000;

@Injectable()
export class TopicSuggestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: BackgroundJobsService,
  ) {}

  async request(
    ownerId: string,
    input: RequestTopicSuggestionsDto,
  ): Promise<TopicSuggestionRequestDto> {
    const now = Date.now();
    return this.prisma.$transaction(async (tx) => {
      // Keep the draft text separate from the generic job and its queue payload.
      const job = await this.jobs.submitInTransaction(
        tx,
        ownerId,
        TOPIC_SUGGESTION_JOB,
        randomUUID(),
        {},
      );
      await tx.topic_suggestion_requests.create({
        data: {
          job_id: job.id,
          title: input.title,
          abstract: input.abstract || null,
          deadline_at: new Date(now + processingWindowMs),
          expires_at: new Date(now + resultLifetimeMs),
        },
      });
      return { requestId: job.id };
    });
  }

  async get(
    ownerId: string,
    requestId: string,
  ): Promise<TopicSuggestionStatusDto> {
    const now = new Date();
    const request = await this.prisma.topic_suggestion_requests.findFirst({
      where: {
        job_id: requestId,
        job: { owner_id: ownerId },
        expires_at: { gt: now },
      },
      select: { status: true, deadline_at: true, topic_ids: true },
    });
    if (!request) throw new NotFoundException();

    if (request.status !== 'ready') {
      const pending = request.status === 'pending' && request.deadline_at > now;
      return { status: pending ? 'pending' : 'unavailable', suggestions: [] };
    }

    const topics = await this.prisma.research_topics.findMany({
      where: { id: { in: request.topic_ids }, is_active: true },
      select: { id: true, name: true, description: true },
    });
    const byId = new Map(topics.map((topic) => [topic.id, topic]));
    const suggestions = request.topic_ids.flatMap((topicId) => {
      const topic = byId.get(topicId);
      return topic
        ? [{ topicId, name: topic.name, description: topic.description }]
        : [];
    });
    return { status: 'ready', suggestions };
  }
}
