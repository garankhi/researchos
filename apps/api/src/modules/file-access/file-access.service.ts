import { HttpStatus, Injectable } from '@nestjs/common';
import {
  Prisma,
  PrismaService,
  stageNotificationEvent,
} from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { buildPaginationMeta } from '../../common/dto/pagination.dto.js';
import {
  readDatabaseFailure,
  UNIQUE_VIOLATION_SQL_STATE,
} from '../../common/errors/database-errors.js';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import type {
  CreateFileAccessRequestDto,
  DecideFileAccessRequestDto,
  FileAccessRequestPageDto,
  FileAccessRequestResponseDto,
  FileAccessRequestStatus,
  ListFileAccessRequestsQueryDto,
} from './dto/file-access.dto.js';

type Tx = Prisma.TransactionClient;

interface LockedFile {
  output_id: string;
  owner_id: string | null;
  visibility: string;
  is_available: boolean;
  in_current_release: boolean;
}

interface RequestRow {
  id: string;
  status: FileAccessRequestStatus;
  message: string | null;
  response: string | null;
  cancel_reason: string | null;
  created_at: Date;
  decided_at: Date | null;
  output_id: string;
  title: string | null;
  file_id: string;
  file_name: string | null;
  is_available: boolean;
  requester_id: string;
  requester_name: string;
  owner_id: string | null;
  owner_name: string | null;
  grant_id: string | null;
  granted_at: Date | null;
  revoked_at: Date | null;
}

const fileNotFound = () =>
  new CodedHttpException(
    domainErrorCodes.storage.fileNotFound,
    HttpStatus.NOT_FOUND,
  );
const requestNotFound = () =>
  new CodedHttpException(
    domainErrorCodes.fileAccess.requestNotFound,
    HttpStatus.NOT_FOUND,
  );
const grantNotFound = () =>
  new CodedHttpException(
    domainErrorCodes.fileAccess.grantNotFound,
    HttpStatus.NOT_FOUND,
  );
const decisionDenied = () =>
  new CodedHttpException(
    domainErrorCodes.fileAccess.decisionDenied,
    HttpStatus.FORBIDDEN,
  );
const notPending = () =>
  new CodedHttpException(
    domainErrorCodes.fileAccess.requestNotPending,
    HttpStatus.CONFLICT,
  );
const notRequestable = () =>
  new CodedHttpException(
    domainErrorCodes.fileAccess.notRequestable,
    HttpStatus.CONFLICT,
  );

/**
 * Requests, decisions and grants for one exact Private output file.
 *
 * Every write locks the Article row (shared) and then the file row, the same
 * order the release path uses when it replaces a file. Eligibility and
 * authority are read again after the locks, and a transition only applies
 * from `PENDING`, so the winner alone writes the audit entry and notification.
 * Download access itself is decided by the SQL policy `can_view_output_file`.
 */
/** Window for the cooldown after a decline or revoke and for the request cap. */
const REQUEST_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 3;

@Injectable()
export class FileAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async submit(
    callerId: string,
    fileId: string,
    dto: CreateFileAccessRequestDto,
  ): Promise<FileAccessRequestResponseDto> {
    const requestId = await this.prisma.$transaction(async (tx) => {
      const file = await this.lockFile(tx, fileId);
      // A reader who cannot see the Article must not learn the file exists.
      if (!file || !(await this.canViewOutput(tx, callerId, file.output_id))) {
        throw fileNotFound();
      }
      if (file.owner_id === callerId) {
        throw new CodedHttpException(
          domainErrorCodes.fileAccess.selfRequest,
          HttpStatus.BAD_REQUEST,
        );
      }
      if (!this.isRequestable(file)) throw notRequestable();
      const [access] = await tx.$queryRaw<{ allowed: boolean }[]>`
        SELECT can_view_output_file(${callerId}::uuid, ${fileId}::uuid) AS allowed
      `;
      if (access?.allowed) {
        throw new CodedHttpException(
          domainErrorCodes.fileAccess.alreadyGranted,
          HttpStatus.CONFLICT,
        );
      }

      // Sending the same request again returns the pending one.
      const pending = await tx.file_access_requests.findFirst({
        where: { file_id: fileId, requester_id: callerId, status: 'PENDING' },
        select: { id: true },
      });
      if (pending) return pending.id;
      await this.assertWithinRequestLimit(tx, callerId, fileId);

      const created = await tx.file_access_requests.create({
        data: {
          output_id: file.output_id,
          file_id: fileId,
          requester_id: callerId,
          message: dto.message ?? null,
        },
        select: { id: true },
      });
      if (file.owner_id) {
        await stageNotificationEvent(tx, {
          key: `file-access:${created.id}:requested`,
          type: 'FILE_ACCESS_REQUESTED',
          actorId: callerId,
          subjectType: 'OUTPUT',
          subjectId: file.output_id,
          payload: {
            recipientId: file.owner_id,
            link: `/outputs/${file.output_id}`,
            requestId: created.id,
            fileId,
          },
        });
      }
      return created.id;
    });
    return this.findVisible(callerId, requestId);
  }

  /**
   * Stops a reader from re-asking right after an owner said no, or from
   * looping submit and withdraw, because every new request notifies the owner.
   * Runs under the file lock, so concurrent submits cannot both slip through.
   */
  private async assertWithinRequestLimit(
    tx: Tx,
    callerId: string,
    fileId: string,
  ): Promise<void> {
    const since = new Date(Date.now() - REQUEST_LIMIT_WINDOW_MS);
    const [declined, revoked, recent] = await Promise.all([
      tx.file_access_requests.findFirst({
        where: {
          file_id: fileId,
          requester_id: callerId,
          status: 'DECLINED',
          decided_at: { gt: since },
        },
        select: { id: true },
      }),
      tx.file_access_grants.findFirst({
        where: {
          file_id: fileId,
          grantee_id: callerId,
          revoked_at: { gt: since },
        },
        select: { id: true },
      }),
      tx.file_access_requests.count({
        where: {
          file_id: fileId,
          requester_id: callerId,
          created_at: { gt: since },
        },
      }),
    ]);
    if (declined || revoked || recent >= MAX_REQUESTS_PER_WINDOW) {
      throw new CodedHttpException(
        domainErrorCodes.fileAccess.requestLimited,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async list(
    callerId: string,
    query: ListFileAccessRequestsQueryDto,
  ): Promise<FileAccessRequestPageDto> {
    const where = Prisma.sql`
      ${
        query.box === 'sent'
          ? Prisma.sql`r.requester_id = ${callerId}::uuid`
          : // The owner index narrows the rows before the policy check.
            Prisma.sql`r.output_id IN (
              SELECT id FROM research_outputs WHERE owner_id = ${callerId}::uuid
            ) AND can_manage_output(${callerId}::uuid, r.output_id)`
      }
      ${query.status ? Prisma.sql`AND r.status = ${query.status}::file_access_request_status` : Prisma.empty}
      ${query.outputId ? Prisma.sql`AND r.output_id = ${query.outputId}::uuid` : Prisma.empty}
    `;
    const [rows, [count]] = await Promise.all([
      this.selectRequests(
        callerId,
        where,
        Prisma.sql`LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`,
      ),
      this.prisma.$queryRaw<{ total: bigint }[]>`
        SELECT count(*) AS total FROM file_access_requests r WHERE ${where}
      `,
    ]);
    const total = Number(count?.total ?? 0);
    return {
      items: rows.map((row) => this.toResponse(row)),
      meta: buildPaginationMeta(query, rows.length, total),
    };
  }

  async approve(
    callerId: string,
    requestId: string,
    dto: DecideFileAccessRequestDto,
  ): Promise<FileAccessRequestResponseDto> {
    await this.prisma.$transaction(async (tx) => {
      const request = await this.lockRequestForDecision(
        tx,
        callerId,
        requestId,
      );
      if (request.status === 'APPROVED') return; // replay
      if (request.status !== 'PENDING') throw notPending();

      const file = (await this.lockFile(tx, request.file_id))!;
      if (!this.isRequestable(file)) throw notRequestable();
      const [eligible] = await tx.$queryRaw<{ ok: boolean }[]>`
        SELECT can_view_output(${request.requester_id}::uuid, ${request.output_id}::uuid) AS ok
      `;
      if (!eligible?.ok) {
        throw new CodedHttpException(
          domainErrorCodes.fileAccess.requesterIneligible,
          HttpStatus.CONFLICT,
        );
      }

      await tx.file_access_requests.update({
        where: { id: requestId, status: 'PENDING' },
        data: {
          status: 'APPROVED',
          decided_by: callerId,
          decided_at: new Date(),
          response: dto.response ?? null,
        },
      });
      let grantId: string;
      try {
        ({ id: grantId } = await tx.file_access_grants.create({
          data: {
            request_id: requestId,
            file_id: request.file_id,
            grantee_id: request.requester_id,
            granted_by: callerId,
          },
          select: { id: true },
        }));
      } catch (error) {
        const failure = readDatabaseFailure(error);
        if (
          failure?.sqlState === UNIQUE_VIOLATION_SQL_STATE &&
          failure.constraintName === 'uq_file_access_grant_active'
        ) {
          throw new CodedHttpException(
            domainErrorCodes.fileAccess.alreadyGranted,
            HttpStatus.CONFLICT,
          );
        }
        throw error;
      }
      await tx.auditLog.create({
        data: {
          actorId: callerId,
          action: 'file_access.approved',
          entity: 'file_access_request',
          entityId: requestId,
          payload: {
            grantId,
            fileId: request.file_id,
            outputId: request.output_id,
            granteeId: request.requester_id,
          },
        },
      });
      await this.stageDecision(
        tx,
        callerId,
        requestId,
        request,
        'FILE_ACCESS_APPROVED',
      );
    });
    return this.findVisible(callerId, requestId);
  }

  async decline(
    callerId: string,
    requestId: string,
    dto: DecideFileAccessRequestDto,
  ): Promise<FileAccessRequestResponseDto> {
    await this.prisma.$transaction(async (tx) => {
      const request = await this.lockRequestForDecision(
        tx,
        callerId,
        requestId,
      );
      if (request.status === 'DECLINED') return; // replay
      if (request.status !== 'PENDING') throw notPending();

      await tx.file_access_requests.update({
        where: { id: requestId, status: 'PENDING' },
        data: {
          status: 'DECLINED',
          decided_by: callerId,
          decided_at: new Date(),
          response: dto.response ?? null,
        },
      });
      await this.stageDecision(
        tx,
        callerId,
        requestId,
        request,
        'FILE_ACCESS_DECLINED',
      );
    });
    return this.findVisible(callerId, requestId);
  }

  async withdraw(
    callerId: string,
    requestId: string,
  ): Promise<FileAccessRequestResponseDto> {
    await this.prisma.$transaction(async (tx) => {
      const found = await tx.file_access_requests.findUnique({
        where: { id: requestId },
        select: { requester_id: true, file_id: true },
      });
      if (!found || found.requester_id !== callerId) throw requestNotFound();
      await this.lockFile(tx, found.file_id);
      const [request] = await tx.$queryRaw<
        { status: FileAccessRequestStatus }[]
      >`
        SELECT status FROM file_access_requests WHERE id = ${requestId}::uuid FOR UPDATE
      `;
      if (request!.status === 'WITHDRAWN') return; // replay
      if (request!.status !== 'PENDING') throw notPending();
      await tx.file_access_requests.update({
        where: { id: requestId, status: 'PENDING' },
        data: {
          status: 'WITHDRAWN',
          decided_by: callerId,
          decided_at: new Date(),
        },
      });
    });
    return this.findVisible(callerId, requestId);
  }

  async revoke(
    callerId: string,
    grantId: string,
  ): Promise<FileAccessRequestResponseDto> {
    const requestId = await this.prisma.$transaction(async (tx) => {
      const found = await tx.file_access_grants.findUnique({
        where: { id: grantId },
        select: {
          request_id: true,
          file_id: true,
          grantee_id: true,
          request: { select: { output_id: true } },
        },
      });
      if (!found) throw grantNotFound();
      await this.lockFile(tx, found.file_id);
      if (!(await this.canManage(tx, callerId, found.request.output_id))) {
        if (found.grantee_id === callerId) throw decisionDenied();
        throw grantNotFound();
      }
      const [grant] = await tx.$queryRaw<{ revoked_at: Date | null }[]>`
        SELECT revoked_at FROM file_access_grants WHERE id = ${grantId}::uuid FOR UPDATE
      `;
      if (grant!.revoked_at) return found.request_id; // replay

      await tx.file_access_grants.update({
        where: { id: grantId },
        data: { revoked_by: callerId, revoked_at: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: callerId,
          action: 'file_access.revoked',
          entity: 'file_access_grant',
          entityId: grantId,
          payload: {
            requestId: found.request_id,
            fileId: found.file_id,
            outputId: found.request.output_id,
            granteeId: found.grantee_id,
          },
        },
      });
      await stageNotificationEvent(tx, {
        key: `file-access-grant:${grantId}:revoked`,
        type: 'FILE_ACCESS_REVOKED',
        actorId: callerId,
        subjectType: 'OUTPUT',
        subjectId: found.request.output_id,
        payload: {
          recipientId: found.grantee_id,
          link: `/outputs/${found.request.output_id}`,
          requestId: found.request_id,
          grantId,
          fileId: found.file_id,
        },
      });
      return found.request_id;
    });
    return this.findVisible(callerId, requestId);
  }

  /**
   * Locks the Article (shared, so it waits for a release change) and then
   * the file. Returns null when the file does not exist.
   */
  private async lockFile(tx: Tx, fileId: string): Promise<LockedFile | null> {
    const [ref] = await tx.$queryRaw<{ output_id: string }[]>`
      SELECT output_id FROM output_files WHERE id = ${fileId}::uuid
    `;
    if (!ref) return null;
    await tx.$queryRaw`
      SELECT 1 FROM research_outputs WHERE id = ${ref.output_id}::uuid FOR SHARE
    `;
    const [file] = await tx.$queryRaw<LockedFile[]>`
      SELECT f.output_id, o.owner_id, f.visibility::text AS visibility, f.is_available,
             EXISTS (
               SELECT 1 FROM output_revision_files rf
               WHERE rf.file_id = f.id AND rf.revision_id = o.current_release_id
             ) AS in_current_release
      FROM output_files f JOIN research_outputs o ON o.id = f.output_id
      WHERE f.id = ${fileId}::uuid
      FOR UPDATE OF f
    `;
    return file ?? null;
  }

  /** Locks the request's file, then the request, and checks the caller manages it. */
  private async lockRequestForDecision(
    tx: Tx,
    callerId: string,
    requestId: string,
  ) {
    const found = await tx.file_access_requests.findUnique({
      where: { id: requestId },
      select: { file_id: true, requester_id: true },
    });
    if (!found) throw requestNotFound();
    await this.lockFile(tx, found.file_id);
    const [request] = await tx.$queryRaw<
      {
        status: FileAccessRequestStatus;
        output_id: string;
        file_id: string;
        requester_id: string;
      }[]
    >`
      SELECT status, output_id, file_id, requester_id
      FROM file_access_requests WHERE id = ${requestId}::uuid FOR UPDATE
    `;
    if (!(await this.canManage(tx, callerId, request!.output_id))) {
      if (found.requester_id === callerId) throw decisionDenied();
      throw requestNotFound();
    }
    return request!;
  }

  private isRequestable(file: LockedFile): boolean {
    return (
      file.visibility === 'PRIVATE' &&
      file.is_available &&
      file.in_current_release
    );
  }

  private async canViewOutput(tx: Tx, actor: string, outputId: string) {
    const [row] = await tx.$queryRaw<{ ok: boolean }[]>`
      SELECT can_view_output(${actor}::uuid, ${outputId}::uuid) AS ok
    `;
    return row?.ok === true;
  }

  private async canManage(tx: Tx, actor: string, outputId: string) {
    const [row] = await tx.$queryRaw<{ ok: boolean }[]>`
      SELECT can_manage_output(${actor}::uuid, ${outputId}::uuid) AS ok
    `;
    return row?.ok === true;
  }

  private async stageDecision(
    tx: Tx,
    callerId: string,
    requestId: string,
    request: { output_id: string; file_id: string; requester_id: string },
    type: 'FILE_ACCESS_APPROVED' | 'FILE_ACCESS_DECLINED',
  ) {
    await stageNotificationEvent(tx, {
      key: `file-access:${requestId}:${type === 'FILE_ACCESS_APPROVED' ? 'approved' : 'declined'}`,
      type,
      actorId: callerId,
      subjectType: 'OUTPUT',
      subjectId: request.output_id,
      payload: {
        recipientId: request.requester_id,
        link: `/outputs/${request.output_id}`,
        requestId,
        fileId: request.file_id,
      },
    });
  }

  /** Reads one request as either party sees it, after a write. */
  private async findVisible(
    callerId: string,
    requestId: string,
  ): Promise<FileAccessRequestResponseDto> {
    const [row] = await this.selectRequests(
      callerId,
      Prisma.sql`r.id = ${requestId}::uuid AND (r.requester_id = ${callerId}::uuid
        OR can_manage_output(${callerId}::uuid, r.output_id))`,
      Prisma.sql`LIMIT 1`,
    );
    if (!row) throw requestNotFound();
    return this.toResponse(row);
  }

  /**
   * Article title and file name are hidden from a party who can no longer
   * view the Article. Only names are returned for people, never emails.
   */
  private selectRequests(
    callerId: string,
    where: Prisma.Sql,
    page: Prisma.Sql,
  ): Promise<RequestRow[]> {
    return this.prisma.$queryRaw<RequestRow[]>`
      SELECT r.id, r.status::text AS status, r.message, r.response, r.cancel_reason,
             r.created_at, r.decided_at, r.output_id, r.file_id, r.requester_id,
             CASE WHEN can_view_output(${callerId}::uuid, r.output_id) THEN rev.title END AS title,
             CASE WHEN can_view_output(${callerId}::uuid, r.output_id) THEN f.file_name END AS file_name,
             f.is_available,
             requester.full_name AS requester_name,
             o.owner_id, owner.full_name AS owner_name,
             g.id AS grant_id, g.granted_at, g.revoked_at
      FROM file_access_requests r
      JOIN output_files f ON f.id = r.file_id
      JOIN research_outputs o ON o.id = r.output_id
      LEFT JOIN output_revisions rev ON rev.id = o.current_release_id
      JOIN users requester ON requester.id = r.requester_id
      LEFT JOIN users owner ON owner.id = o.owner_id
      LEFT JOIN file_access_grants g ON g.request_id = r.id
      WHERE ${where}
      ORDER BY r.created_at DESC, r.id DESC
      ${page}
    `;
  }

  private toResponse(row: RequestRow): FileAccessRequestResponseDto {
    return {
      id: row.id,
      status: row.status,
      message: row.message,
      response: row.response,
      cancelReason: row.cancel_reason,
      createdAt: row.created_at.toISOString(),
      decidedAt: row.decided_at?.toISOString() ?? null,
      article: { id: row.output_id, title: row.title },
      file: {
        id: row.file_id,
        fileName: row.file_name,
        isAvailable: row.is_available,
      },
      requester: { id: row.requester_id, fullName: row.requester_name },
      owner:
        row.owner_id && row.owner_name
          ? { id: row.owner_id, fullName: row.owner_name }
          : null,
      grant: row.grant_id
        ? {
            id: row.grant_id,
            grantedAt: row.granted_at!.toISOString(),
            revokedAt: row.revoked_at?.toISOString() ?? null,
          }
        : null,
    };
  }
}
