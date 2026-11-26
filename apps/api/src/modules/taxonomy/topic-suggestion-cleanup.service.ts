import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '@researchos/database';
import { TOPIC_SUGGESTION_JOB } from '@researchos/queue';

const sweepIntervalMs = 5_000;

@Injectable()
export class TopicSuggestionCleanupService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(TopicSuggestionCleanupService.name);
  private timer?: NodeJS.Timeout;
  private runningSweep?: Promise<void>;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap(): void {
    // Retention is independent of the Ollama worker's availability.
    this.timer = setInterval(() => {
      this.runningSweep ??= this.sweep()
        .catch(() =>
          this.logger.warn('Could not sweep expired Topic suggestions'),
        )
        .finally(() => {
          this.runningSweep = undefined;
        });
    }, sweepIntervalMs).unref();
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.runningSweep;
  }

  private async sweep(): Promise<void> {
    const now = new Date();
    // Finish both records together so the general jobs endpoint also stops
    // reporting expired work as pending. The processor uses the same lock order.
    await this.prisma.$executeRaw`
      WITH expired AS (
        UPDATE topic_suggestion_requests
        SET status = 'unavailable', title = NULL, abstract = NULL
        WHERE status = 'pending' AND deadline_at <= ${now}
        RETURNING job_id
      )
      UPDATE background_jobs j SET status = 'COMPLETED', updated_at = ${now}
      FROM expired e
      WHERE j.id = e.job_id AND j.kind = ${TOPIC_SUGGESTION_JOB} AND j.status = 'PENDING'
    `;
    await this.prisma.background_jobs.deleteMany({
      where: {
        kind: TOPIC_SUGGESTION_JOB,
        topic_suggestion_request: { is: { expires_at: { lte: now } } },
      },
    });
  }
}
