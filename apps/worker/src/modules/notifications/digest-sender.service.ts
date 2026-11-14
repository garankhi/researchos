import { isDeepStrictEqual } from 'node:util';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@researchos/database';
import {
  DIGEST_MAX_ATTEMPTS,
  DIGEST_SEND_JOB,
  digestDeliveryId,
  type BackgroundJobPayload,
} from '@researchos/queue';
import { DigestTemplate } from './digest-template.js';
import {
  MAIL_PROVIDER,
  type MailOutcome,
  type MailProvider,
} from './mail-provider.js';

const LEASE_MS = 120_000;
const FIRST_BACKOFF_MS = 60_000;
const RETRYABLE_DATABASE_ERRORS = new Set([
  'P1001', // Database unreachable
  'P1002', // Connection timed out
  'P1008', // Operation timed out
  'P1017', // Connection closed
  'P2024', // Connection pool timed out
  'P2028', // Interactive transaction expired or closed
  'P2034', // Write conflict or deadlock
]);

interface ReleasedOutput {
  output_id: string;
  revision_id: string;
  title: string;
}

interface AuthorizedDigest {
  email: string;
  language: string;
  outputs: ReleasedOutput[];
}

interface Claim {
  id: string;
  ownerId: string;
  attempt: number;
  content: AuthorizedDigest;
}

type SendOutcome = MailOutcome | { contentChanged: true };

@Injectable()
export class DigestSender {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DigestTemplate) private readonly template: DigestTemplate,
    @Inject(MAIL_PROVIDER) private readonly mail: MailProvider | null,
  ) {}

  get enabled(): boolean {
    return this.mail !== null;
  }

  async process(ref: BackgroundJobPayload, prefix: string): Promise<void> {
    if (!this.mail) return;
    const claim = await this.prisma.$transaction(async (tx) => {
      const candidate = await this.findJob(tx, ref, prefix);
      if (!candidate) return null;

      // The producer writes the delivery before it submits the job. Match that
      // lock order when claiming and when recording the outcome.
      const deliveryId = digestDeliveryId(candidate.payload);
      const delivery = deliveryId
        ? await this.lockDelivery(tx, deliveryId, candidate.owner_id)
        : undefined;
      const job = await this.findJob(tx, ref, prefix, true);
      if (
        !job ||
        job.owner_id !== candidate.owner_id ||
        digestDeliveryId(job.payload) !== deliveryId
      )
        return null;
      if (!deliveryId || !delivery) {
        await this.finishJob(tx, ref, 'invalid_digest_reference');
        return null;
      }
      if (delivery.status === 'SENT' || delivery.status === 'CANCELLED') {
        await this.finishJob(tx, ref);
        return null;
      }

      const [{ now }] = await tx.$queryRaw<
        [{ now: Date }]
      >`SELECT clock_timestamp() AS now`;
      if (
        delivery.next_attempt_at > now ||
        (delivery.locked_until && delivery.locked_until > now)
      )
        return null;

      if (
        delivery.last_error === 'smtp_permanent' ||
        delivery.attempts >= DIGEST_MAX_ATTEMPTS
      ) {
        const code =
          delivery.status === 'PROCESSING'
            ? 'smtp_unknown'
            : (delivery.last_error ?? 'digest_attempts_exhausted');
        await tx.digest_deliveries.update({
          where: { id: deliveryId },
          data: { status: 'FAILED', locked_until: null, last_error: code },
        });
        await this.finishJob(tx, ref, code);
        return null;
      }

      const content = await this.readAuthorizedDigest(tx, deliveryId);
      await this.writeSnapshot(tx, deliveryId, content?.outputs ?? []);
      if (!content?.outputs.length) {
        await this.cancel(tx, ref, deliveryId);
        return null;
      }

      const attempt = delivery.attempts + 1;
      const lease = now.getTime() + LEASE_MS;
      await tx.digest_deliveries.update({
        where: { id: deliveryId },
        data: {
          status: 'PROCESSING',
          attempts: attempt,
          locked_until: new Date(lease),
          next_attempt_at: new Date(lease + backoff(attempt)),
        },
      });
      return {
        id: deliveryId,
        ownerId: job.owner_id,
        attempt,
        content,
      } satisfies Claim;
    });
    if (!claim) return;

    const { email, language, outputs } = claim.content;
    const message = this.template.render(language, outputs);
    // Snapshot writes can block while access changes elsewhere. Read current
    // permissions and the address after commit, immediately before submission.
    const current = await this.readAuthorizedDigest(
      this.prisma,
      claim.id,
      claim.attempt,
    );
    const outcome: SendOutcome = isDeepStrictEqual(current, claim.content)
      ? await this.mail.send({ to: email, ...message })
      : { contentChanged: true };
    try {
      await this.recordOutcome(ref, prefix, claim, outcome);
    } catch (error) {
      if (
        !('accepted' in outcome && outcome.accepted) ||
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        !RETRYABLE_DATABASE_ERRORS.has(error.code)
      ) {
        throw error;
      }
      // Retry the database transaction with the same SMTP result. The delivery
      // status and attempt check prevent replaying a completed or stale write.
      await this.recordOutcome(ref, prefix, claim, outcome);
    }
  }

  private async readAuthorizedDigest(
    db: Prisma.TransactionClient,
    deliveryId: string,
    attempt: number | null = null,
  ): Promise<AuthorizedDigest | null> {
    const [content] = await db.$queryRaw<AuthorizedDigest[]>`
      SELECT u.email::text AS email, p.language,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'output_id', r.output_id, 'revision_id', r.revision_id, 'title', r.title
          ) ORDER BY r.output_id)
          FROM digest_items i
          JOIN visible_output_releases(u.id) r ON r.output_id = i.subject_id
          WHERE i.delivery_id = d.id AND i.subject_type = 'OUTPUT'
        ), '[]'::jsonb) AS outputs
      FROM digest_deliveries d
      JOIN users u ON u.id = d.user_id
      JOIN digest_preferences p ON p.user_id = u.id AND p.enabled
      WHERE d.id = ${deliveryId}::uuid AND is_researcher(u.id)
        AND (${attempt}::int IS NULL OR (
          d.status = 'PROCESSING' AND d.attempts = ${attempt}::int
          AND d.locked_until > clock_timestamp()
        ))
    `;
    return content ?? null;
  }

  private async writeSnapshot(
    tx: Prisma.TransactionClient,
    deliveryId: string,
    outputs: ReleasedOutput[],
  ): Promise<void> {
    await tx.$executeRaw`
      WITH authorized AS (
        SELECT * FROM jsonb_to_recordset(${JSON.stringify(outputs)}::jsonb)
          AS r(output_id uuid, revision_id uuid, title text)
      ), pruned AS (
        DELETE FROM digest_items AS i
        WHERE i.delivery_id = ${deliveryId}::uuid
          AND (i.subject_type <> 'OUTPUT' OR NOT EXISTS (
            SELECT 1 FROM authorized AS r WHERE r.output_id = i.subject_id
          ))
      )
      UPDATE digest_items AS i
      SET content_snapshot = jsonb_build_object('title', r.title, 'revision_id', r.revision_id)
      FROM authorized AS r
      WHERE i.delivery_id = ${deliveryId}::uuid
        AND i.subject_type = 'OUTPUT' AND i.subject_id = r.output_id
    `;
  }

  private async cancel(
    tx: Prisma.TransactionClient,
    ref: BackgroundJobPayload,
    deliveryId: string,
  ) {
    await tx.digest_deliveries.update({
      where: { id: deliveryId },
      data: { status: 'CANCELLED', locked_until: null },
    });
    await this.finishJob(tx, ref);
  }

  private async recordOutcome(
    ref: BackgroundJobPayload,
    prefix: string,
    claim: Claim,
    outcome: SendOutcome,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const delivery = await this.lockDelivery(tx, claim.id, claim.ownerId);
      if (
        delivery?.status !== 'PROCESSING' ||
        delivery.attempts !== claim.attempt
      )
        return;
      const job = await this.findJob(tx, ref, prefix, true);
      if (
        !job ||
        job.owner_id !== claim.ownerId ||
        digestDeliveryId(job.payload) !== claim.id
      )
        return;

      const [{ now }] = await tx.$queryRaw<
        [{ now: Date }]
      >`SELECT clock_timestamp() AS now`;
      if ('accepted' in outcome && outcome.accepted) {
        await tx.digest_deliveries.update({
          where: { id: claim.id },
          data: {
            status: 'SENT',
            sent_at: now,
            provider_message_id: outcome.messageId,
            locked_until: null,
            last_error: null,
          },
        });
        await this.finishJob(tx, ref);
        return;
      }

      if ('contentChanged' in outcome) {
        // Reread under the current lease before pruning. The earlier check
        // can also return null when the lease expires before submission.
        const content = await this.readAuthorizedDigest(tx, claim.id);
        await this.writeSnapshot(tx, claim.id, content?.outputs ?? []);
        if (!content?.outputs.length) {
          await this.cancel(tx, ref, claim.id);
          return;
        }
      }

      const errorCode =
        'contentChanged' in outcome ? 'digest_content_changed' : outcome.code;
      const terminal =
        errorCode === 'smtp_permanent' || claim.attempt >= DIGEST_MAX_ATTEMPTS;
      await tx.digest_deliveries.update({
        where: { id: claim.id },
        data: {
          status: 'FAILED',
          locked_until: null,
          last_error: errorCode,
          next_attempt_at: terminal
            ? now
            : new Date(now.getTime() + backoff(claim.attempt)),
        },
      });
      if (terminal) await this.finishJob(tx, ref, errorCode);
    });
  }

  private async findJob(
    tx: Prisma.TransactionClient,
    ref: BackgroundJobPayload,
    prefix: string,
    lock = false,
  ) {
    const rows = await tx.$queryRaw<
      { owner_id: string; payload: Prisma.JsonValue }[]
    >`
      SELECT owner_id, payload FROM background_jobs
      WHERE id = ${ref.jobId}::uuid AND generation = ${ref.generation}
        AND queue_prefix = ${prefix} AND kind = ${DIGEST_SEND_JOB} AND status = 'PENDING'
      ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}
    `;
    return rows[0];
  }

  private async lockDelivery(
    tx: Prisma.TransactionClient,
    id: string,
    ownerId: string,
  ) {
    const rows = await tx.$queryRaw<
      {
        status: string;
        attempts: number;
        locked_until: Date | null;
        next_attempt_at: Date;
        last_error: string | null;
      }[]
    >`
      SELECT status, attempts, locked_until, next_attempt_at, last_error
      FROM digest_deliveries WHERE id = ${id}::uuid AND user_id = ${ownerId}::uuid
      FOR UPDATE
    `;
    return rows[0];
  }

  private async finishJob(
    tx: Prisma.TransactionClient,
    ref: BackgroundJobPayload,
    errorCode?: string,
  ) {
    await tx.background_jobs.update({
      where: { id: ref.jobId },
      data: {
        status: errorCode ? 'FAILED' : 'COMPLETED',
        error_code: errorCode ?? null,
        updated_at: new Date(),
        ...(errorCode
          ? {
              outbox: {
                create: { generation: ref.generation, destination: 'DLQ' },
              },
            }
          : {}),
      },
    });
  }
}

function backoff(attempt: number): number {
  return attempt >= DIGEST_MAX_ATTEMPTS
    ? 0
    : FIRST_BACKOFF_MS * 2 ** (attempt - 1);
}
