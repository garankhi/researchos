import { isDeepStrictEqual } from 'node:util';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from './generated/prisma/client.js';
import { PrismaService } from './prisma.service.js';

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

  async findOwned(ownerId: string, id: string) {
    const job = await this.prisma.background_jobs.findFirst({
      where: { id, owner_id: ownerId },
    });
    if (!job) throw new NotFoundException();
    return job;
  }

  async retryOwned(ownerId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      // Lock before reading the generation; two retry requests cannot both win.
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM background_jobs
        WHERE id = ${id}::uuid AND owner_id = ${ownerId}::uuid FOR UPDATE
      `;
      if (!rows.length) throw new NotFoundException();
      const job = await tx.background_jobs.findUniqueOrThrow({ where: { id } });
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
