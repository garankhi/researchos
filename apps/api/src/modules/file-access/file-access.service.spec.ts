import 'reflect-metadata';
import type { PrismaService } from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileAccessService } from './file-access.service.js';

const owner = '10000000-0000-4000-8000-000000000001';
const reader = '10000000-0000-4000-8000-000000000002';
const stranger = '10000000-0000-4000-8000-000000000003';
const outputId = '10000000-0000-4000-8000-000000000004';
const fileId = '10000000-0000-4000-8000-000000000005';
const requestId = '10000000-0000-4000-8000-000000000006';
const grantId = '10000000-0000-4000-8000-000000000007';
const now = new Date('2026-11-25T00:00:00Z');

/** What the SQL policy functions report, per actor. */
interface World {
  file: {
    owner_id: string | null;
    visibility: string;
    is_available: boolean;
    in_current_release: boolean;
  } | null;
  canView: Set<string>;
  canManage: Set<string>;
  canDownload: Set<string>;
  requestStatus: string;
  revokedAt: Date | null;
}

function row(world: World) {
  return {
    id: requestId,
    status: world.requestStatus,
    message: null,
    response: null,
    cancel_reason: null,
    created_at: now,
    decided_at: world.requestStatus === 'PENDING' ? null : now,
    output_id: outputId,
    title: 'Article',
    file_id: fileId,
    file_name: 'paper.pdf',
    is_available: true,
    requester_id: reader,
    requester_name: 'Reader',
    owner_id: owner,
    owner_name: 'Owner',
    grant_id: null,
    granted_at: null,
    revoked_at: null,
  };
}

/**
 * A fake client. Raw queries are answered by what their SQL asks for, so the
 * tests describe policy outcomes rather than call order.
 */
function fakePrisma(world: World) {
  const sqlOf = (parts: TemplateStringsArray | { strings?: string[] }) =>
    Array.isArray(parts)
      ? parts.join('?')
      : ((parts as { strings?: string[] }).strings ?? []).join('?');
  const actorOf = (values: unknown[]) => values[0] as string;
  const queryRaw = vi.fn(
    async (parts: TemplateStringsArray, ...values: unknown[]) => {
      const sql = sqlOf(parts);
      if (sql.includes('SELECT output_id FROM output_files'))
        return world.file ? [{ output_id: outputId }] : [];
      if (sql.includes('FOR SHARE')) return [];
      if (sql.includes('FOR UPDATE OF f'))
        return world.file ? [{ output_id: outputId, ...world.file }] : [];
      if (sql.includes('can_view_output_file('))
        return [{ allowed: world.canDownload.has(actorOf(values)) }];
      if (sql.includes('can_view_output(') && sql.includes('AS ok'))
        return [{ ok: world.canView.has(actorOf(values)) }];
      if (sql.includes('can_manage_output(') && sql.includes('AS ok'))
        return [{ ok: world.canManage.has(actorOf(values)) }];
      if (sql.includes('SELECT status, output_id, file_id, requester_id'))
        return [
          {
            status: world.requestStatus,
            output_id: outputId,
            file_id: fileId,
            requester_id: reader,
          },
        ];
      if (sql.includes('SELECT status FROM file_access_requests'))
        return [{ status: world.requestStatus }];
      if (sql.includes('SELECT revoked_at FROM file_access_grants'))
        return [{ revoked_at: world.revokedAt }];
      if (sql.includes('FROM file_access_requests r')) return [row(world)];
      if (sql.includes('INSERT INTO notification_events')) return 1;
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  );
  const tx = {
    $queryRaw: queryRaw,
    $executeRaw: vi.fn(async () => 1),
    auditLog: { create: vi.fn() },
    file_access_requests: {
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async () => ({
        requester_id: reader,
        file_id: fileId,
      })),
      create: vi.fn(async () => ({ id: requestId })),
      update: vi.fn(async () => ({})),
    },
    file_access_grants: {
      findUnique: vi.fn(async () => ({
        request_id: requestId,
        file_id: fileId,
        grantee_id: reader,
        request: { output_id: outputId },
      })),
      create: vi.fn(async () => ({ id: grantId })),
      update: vi.fn(async () => ({})),
    },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  return { prisma: prisma as unknown as PrismaService, tx };
}

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return 'resolved';
};

describe('FileAccessService', () => {
  let world: World;

  beforeEach(() => {
    world = {
      file: {
        owner_id: owner,
        visibility: 'PRIVATE',
        is_available: true,
        in_current_release: true,
      },
      canView: new Set([owner, reader]),
      canManage: new Set([owner]),
      canDownload: new Set([owner]),
      requestStatus: 'PENDING',
      revokedAt: null,
    };
  });

  describe('submit', () => {
    it('creates a pending request and notifies the owner only', async () => {
      const { prisma, tx } = fakePrisma(world);
      const result = await new FileAccessService(prisma).submit(
        reader,
        fileId,
        {
          message: 'Please',
        },
      );

      expect(result.status).toBe('PENDING');
      expect(tx.file_access_requests.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            requester_id: reader,
            message: 'Please',
          }),
        }),
      );
      const staged = JSON.stringify(tx.$executeRaw.mock.calls);
      expect(staged).toContain('FILE_ACCESS_REQUESTED');
      expect(staged).toContain(owner);
      expect(staged).not.toContain('Please');
    });

    it('returns the pending request instead of creating a second one', async () => {
      const { prisma, tx } = fakePrisma(world);
      tx.file_access_requests.findFirst.mockResolvedValue({
        id: requestId,
      } as never);

      await new FileAccessService(prisma).submit(reader, fileId, {});

      expect(tx.file_access_requests.create).not.toHaveBeenCalled();
      expect(tx.$executeRaw).not.toHaveBeenCalled();
    });

    it.each([
      [
        'a missing file',
        () => (world.file = null),
        reader,
        domainErrorCodes.storage.fileNotFound,
      ],
      [
        'a hidden Article',
        () => world.canView.delete(stranger),
        stranger,
        domainErrorCodes.storage.fileNotFound,
      ],
      [
        'the owner',
        () => undefined,
        owner,
        domainErrorCodes.fileAccess.selfRequest,
      ],
      [
        'a community file',
        () => (world.file!.visibility = 'FPTU_COMMUNITY'),
        reader,
        domainErrorCodes.fileAccess.notRequestable,
      ],
      [
        'an unavailable file',
        () => (world.file!.is_available = false),
        reader,
        domainErrorCodes.fileAccess.notRequestable,
      ],
      [
        'an older release file',
        () => (world.file!.in_current_release = false),
        reader,
        domainErrorCodes.fileAccess.notRequestable,
      ],
      [
        'a reader who can download',
        () => world.canDownload.add(reader),
        reader,
        domainErrorCodes.fileAccess.alreadyGranted,
      ],
    ])('refuses %s', async (_label, arrange, actor, code) => {
      arrange();
      const { prisma, tx } = fakePrisma(world);

      expect(
        await codeOf(new FileAccessService(prisma).submit(actor, fileId, {})),
      ).toBe(code);
      expect(tx.file_access_requests.create).not.toHaveBeenCalled();
    });
  });

  describe('approve', () => {
    it('grants the exact file, audits and notifies the requester', async () => {
      const { prisma, tx } = fakePrisma(world);
      await new FileAccessService(prisma).approve(owner, requestId, {
        response: 'OK',
      });

      expect(tx.file_access_requests.update).toHaveBeenCalledWith({
        where: { id: requestId, status: 'PENDING' },
        data: expect.objectContaining({
          status: 'APPROVED',
          decided_by: owner,
          response: 'OK',
        }),
      });
      expect(tx.file_access_grants.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            request_id: requestId,
            file_id: fileId,
            grantee_id: reader,
            granted_by: owner,
          },
        }),
      );
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'file_access.approved',
          entityId: requestId,
        }),
      });
      expect(JSON.stringify(tx.$executeRaw.mock.calls)).toContain(
        'FILE_ACCESS_APPROVED',
      );
    });

    it('replays an approved request without a second grant, audit or event', async () => {
      world.requestStatus = 'APPROVED';
      const { prisma, tx } = fakePrisma(world);
      await new FileAccessService(prisma).approve(owner, requestId, {});

      expect(tx.file_access_grants.create).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
      expect(tx.$executeRaw).not.toHaveBeenCalled();
    });

    it.each([
      ['the requester', reader, domainErrorCodes.fileAccess.decisionDenied],
      [
        'an unrelated user',
        stranger,
        domainErrorCodes.fileAccess.requestNotFound,
      ],
    ])('refuses %s', async (_label, actor, code) => {
      const { prisma, tx } = fakePrisma(world);
      expect(
        await codeOf(
          new FileAccessService(prisma).approve(actor, requestId, {}),
        ),
      ).toBe(code);
      expect(tx.file_access_requests.update).not.toHaveBeenCalled();
    });

    it.each([
      [
        'a declined request',
        () => (world.requestStatus = 'DECLINED'),
        domainErrorCodes.fileAccess.requestNotPending,
      ],
      [
        'a file that left the release',
        () => (world.file!.in_current_release = false),
        domainErrorCodes.fileAccess.notRequestable,
      ],
      [
        'a requester who lost the Article',
        () => world.canView.delete(reader),
        domainErrorCodes.fileAccess.requesterIneligible,
      ],
    ])('refuses %s', async (_label, arrange, code) => {
      arrange();
      const { prisma, tx } = fakePrisma(world);
      expect(
        await codeOf(
          new FileAccessService(prisma).approve(owner, requestId, {}),
        ),
      ).toBe(code);
      expect(tx.file_access_grants.create).not.toHaveBeenCalled();
    });

    it('fails the whole transition when the audit write fails', async () => {
      const { prisma, tx } = fakePrisma(world);
      tx.auditLog.create.mockRejectedValue(new Error('audit down'));
      await expect(
        new FileAccessService(prisma).approve(owner, requestId, {}),
      ).rejects.toThrow('audit down');
      expect(tx.$executeRaw).not.toHaveBeenCalled();
    });
  });

  describe('withdraw', () => {
    it('lets only the requester withdraw', async () => {
      const { prisma } = fakePrisma(world);
      expect(
        await codeOf(new FileAccessService(prisma).withdraw(owner, requestId)),
      ).toBe(domainErrorCodes.fileAccess.requestNotFound);
    });

    it('refuses an answered request', async () => {
      world.requestStatus = 'APPROVED';
      const { prisma } = fakePrisma(world);
      expect(
        await codeOf(new FileAccessService(prisma).withdraw(reader, requestId)),
      ).toBe(domainErrorCodes.fileAccess.requestNotPending);
    });
  });

  describe('revoke', () => {
    it('revokes, audits and notifies the grantee', async () => {
      const { prisma, tx } = fakePrisma(world);
      await new FileAccessService(prisma).revoke(owner, grantId);

      expect(tx.file_access_grants.update).toHaveBeenCalledWith({
        where: { id: grantId },
        data: expect.objectContaining({ revoked_by: owner }),
      });
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'file_access.revoked',
          entityId: grantId,
        }),
      });
      expect(JSON.stringify(tx.$executeRaw.mock.calls)).toContain(
        'FILE_ACCESS_REVOKED',
      );
    });

    it('replays a revoked grant without changes', async () => {
      world.revokedAt = now;
      const { prisma, tx } = fakePrisma(world);
      await new FileAccessService(prisma).revoke(owner, grantId);
      expect(tx.file_access_grants.update).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it.each([
      ['the grantee', reader, domainErrorCodes.fileAccess.decisionDenied],
      [
        'an unrelated user',
        stranger,
        domainErrorCodes.fileAccess.grantNotFound,
      ],
    ])('refuses %s', async (_label, actor, code) => {
      const { prisma, tx } = fakePrisma(world);
      expect(
        await codeOf(new FileAccessService(prisma).revoke(actor, grantId)),
      ).toBe(code);
      expect(tx.file_access_grants.update).not.toHaveBeenCalled();
    });
  });
});
