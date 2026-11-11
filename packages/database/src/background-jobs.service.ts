import { isDeepStrictEqual } from 'node:util';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from './generated/prisma/client.js';
import { PrismaService } from './prisma.service.js';

export const RESEARCH_UPDATE_JOB = 'research-update';
export const UNASSIGNED_RESEARCH_UPDATE_SCOPE = '@research-updates';

// Admins can operate research updates because these jobs represent shared
// publication history. Other job kinds remain private to their owners.
function jobAccess(callerId: string) {
  return Prisma.sql`(
    owner_id = ${callerId}::uuid OR (
      kind = ${RESEARCH_UPDATE_JOB} AND is_admin(${callerId}::uuid)
    )
  )`;
}

/** Durable job identity and transactional submission, shared by API and worker. */
@Injectable()
export class BackgroundJobsService {
  private readonly queuePrefix = process.env.QUEUE_PREFIX ?? 'researchos';
  constructor(private readonly prisma: PrismaService) {}

  // Features call this with their existing transaction, after their domain write.
  // The unique request key serializes concurrent submissions without duplicate work.
  async submitInTransaction(
    tx: Prisma.TransactionClient,
    ownerId: string,
    kind: string,
    idempotencyKey: string,
    payload: Prisma.InputJsonObject,
  ) {
    // Native ON CONFLICT avoids Prisma's read/create race for a nested upsert.
    await tx.$executeRaw`
      INSERT INTO background_jobs (owner_id, kind, idempotency_key, payload, queue_prefix)
      VALUES (${ownerId}::uuid, ${kind}, ${idempotencyKey}, ${JSON.stringify(payload)}::jsonb, ${this.queuePrefix})
      ON CONFLICT (owner_id, kind, idempotency_key)
      DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
    `;
    const job = await tx.background_jobs.findUniqueOrThrow({
      where: {
        owner_id_kind_idempotency_key: {
          owner_id: ownerId,
          kind,
          idempotency_key: idempotencyKey,
        },
      },
    });
    if (!isDeepStrictEqual(job.payload, payload)) throw new ConflictException();
    await tx.outbox.createMany({
      data: [{ job_id: job.id, generation: 0 }],
      skipDuplicates: true,
    });
    return job;
  }

  submit(
    ownerId: string,
    kind: string,
    key: string,
    payload: Prisma.InputJsonObject,
  ) {
    return this.prisma.$transaction((tx) =>
      this.submitInTransaction(tx, ownerId, kind, key, payload),
    );
  }

  async findAccessible(callerId: string, id: string) {
    const [job] = await this.prisma.$queryRaw<
      Prisma.background_jobsGetPayload<undefined>[]
    >`
      SELECT * FROM background_jobs WHERE id = ${id}::uuid AND ${jobAccess(callerId)}
    `;
    if (!job) throw new NotFoundException();
    return job;
  }

  async retryAccessible(callerId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      // Lock before reading the generation; two retry requests cannot both win.
      const [job] = await tx.$queryRaw<
        Prisma.background_jobsGetPayload<undefined>[]
      >`
        SELECT * FROM background_jobs
        WHERE id = ${id}::uuid AND ${jobAccess(callerId)}
        FOR UPDATE
      `;
      if (!job) throw new NotFoundException();
      if (job.status !== 'FAILED') throw new ConflictException();
      return tx.background_jobs.update({
        where: { id },
        data: {
          status: 'PENDING',
          generation: { increment: 1 },
          attempts: 0,
          error_code: null,
          result: Prisma.DbNull,
          updated_at: new Date(),
          outbox: { create: { generation: job.generation + 1 } },
        },
      });
    });
  }
}
