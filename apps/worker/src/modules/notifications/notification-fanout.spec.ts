import { randomUUID } from 'node:crypto';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { Prisma } from '@researchos/database';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fanOutNotification, resolveLocale } from './notification-fanout.js';

describe('Notification locale resolution', () => {
  it('prefers the registered device locale over the stored preference', () => {
    expect(resolveLocale({ device: 'en', preference: 'vi' })).toBe('en');
    expect(resolveLocale({ device: 'vi', preference: 'en' })).toBe('vi');
  });

  it('falls back to the preference when the recipient has no device', () => {
    // A recipient who never enabled push still receives readable copy.
    expect(resolveLocale({ preference: 'en' })).toBe('en');
    expect(resolveLocale({ preference: 'vi' })).toBe('vi');
  });

  it('falls back to Vietnamese when neither a device nor a preference exists', () => {
    expect(resolveLocale({})).toBe('vi');
    expect(resolveLocale({ device: undefined, preference: undefined })).toBe(
      'vi',
    );
  });

  it('resolves a regional English tag to the English copy', () => {
    expect(resolveLocale({ device: 'en-GB' })).toBe('en');
    expect(resolveLocale({ preference: 'EN-US' })).toBe('en');
  });

  it('resolves a regional Vietnamese tag to the Vietnamese copy', () => {
    expect(resolveLocale({ device: 'vi-VN' })).toBe('vi');
    expect(resolveLocale({ preference: 'VI' })).toBe('vi');
  });

  it('resolves an unknown locale to the Vietnamese copy', () => {
    expect(resolveLocale({ preference: 'fr' })).toBe('vi');
    expect(resolveLocale({ preference: '' })).toBe('vi');
  });
});

describe('Private file access notifications', () => {
  const owner = randomUUID();
  const requester = randomUUID();
  const actorFollower = randomUUID();
  const topicFollower = randomUUID();
  const groupMember = randomUUID();
  const subject = randomUUID();
  const eventId = randomUUID();
  const requestId = randomUUID();
  const fileId = randomUUID();
  const grantId = randomUUID();
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, is_active INTEGER);
      CREATE TABLE file_access_requests (id TEXT, output_id TEXT, file_id TEXT, requester_id TEXT, status TEXT);
      CREATE TABLE file_access_grants (id TEXT, request_id TEXT, file_id TEXT, grantee_id TEXT, revoked_at TEXT);
      CREATE TABLE output_files (id TEXT, output_id TEXT);
    `);
    db.function('can_manage_output', (user, output) =>
      Number(user === owner && output === subject),
    );
    for (const id of [
      owner,
      requester,
      actorFollower,
      topicFollower,
      groupMember,
    ]) {
      db.prepare('INSERT INTO users VALUES (?, 1)').run(id);
    }
    db.prepare('INSERT INTO file_access_requests VALUES (?, ?, ?, ?, ?)').run(
      requestId,
      subject,
      fileId,
      requester,
      'PENDING',
    );
    db.prepare('INSERT INTO output_files VALUES (?, ?)').run(fileId, subject);
    db.prepare('INSERT INTO file_access_grants VALUES (?, ?, ?, ?, NULL)').run(
      grantId,
      requestId,
      fileId,
      requester,
    );
  });

  afterEach(() => db.close());

  type Transition = 'REQUESTED' | 'APPROVED' | 'DECLINED' | 'REVOKED';

  async function notify(
    transition: Transition,
    overrides: Record<string, string | undefined> = {},
  ) {
    const requested = transition === 'REQUESTED';
    const recipientId = requested ? owner : requester;
    const query = vi.fn(
      (parts: TemplateStringsArray, ...values: SQLInputValue[]) => {
        const sql = parts.join('?');
        if (sql.includes('FOR UPDATE')) return [{ id: eventId }];
        // Model who the generic OUTPUT query would select if a private event fell through.
        if (sql.includes('user_follows')) {
          return [actorFollower, topicFollower, groupMember].map((id) => ({
            id,
          }));
        }
        return db
          .prepare(sql.replaceAll('::uuid', '').replaceAll('::text', ''))
          .all(...values);
      },
    );
    const create = vi.fn(
      ({ data }: { data: { recipient_id: string }[] }) => data,
    );
    const tx = {
      $queryRaw: query,
      notification_events: {
        findUniqueOrThrow: () => ({
          event_type: `FILE_ACCESS_${transition}`,
          subject_type: 'OUTPUT',
          subject_id: subject,
          actor_id: requested ? requester : owner,
          payload: {
            link: `/outputs/${subject}`,
            recipientId,
            fileId,
            requestId,
            ...(transition === 'REVOKED' && { grantId }),
            ...overrides,
          },
        }),
        update: vi.fn(),
      },
      users: { findUnique: () => null },
      notification_preferences: { findMany: () => [] },
      push_devices: { findMany: () => [] },
      notifications: { createManyAndReturn: create },
      notification_deliveries: { createMany: vi.fn() },
    };
    await fanOutNotification(tx as unknown as Prisma.TransactionClient, {
      eventId,
    });
    expect(create).toHaveBeenCalledOnce();
    return {
      recipients: create.mock.calls[0][0].data.map((row) => row.recipient_id),
      eligibilityQueries: query.mock.calls.length - 1,
    };
  }

  it.each(['REQUESTED', 'APPROVED', 'DECLINED', 'REVOKED'] as const)(
    '%s reaches only the direct recipient, excluding followers and group members',
    async (transition) => {
      if (transition === 'REVOKED') {
        db.exec("UPDATE file_access_grants SET revoked_at = 'today'");
      } else if (transition !== 'REQUESTED') {
        db.prepare('UPDATE file_access_requests SET status = ?').run(
          transition,
        );
      }
      expect(await notify(transition)).toEqual({
        recipients: [transition === 'REQUESTED' ? owner : requester],
        eligibilityQueries: 1,
      });
      expect(
        (await notify(transition, { recipientId: groupMember })).recipients,
      ).toEqual([]);
    },
  );

  it('skips stale requests, decisions with the wrong status, and unrevoked grants', async () => {
    db.exec("UPDATE file_access_requests SET status = 'WITHDRAWN'");
    for (const transition of [
      'REQUESTED',
      'APPROVED',
      'DECLINED',
      'REVOKED',
    ] as const) {
      expect((await notify(transition)).recipients).toEqual([]);
    }
  });

  it.each(['recipientId', 'requestId', 'fileId', 'grantId'])(
    'rejects a missing or invalid %s before querying eligibility',
    async (key) => {
      for (const value of [undefined, 'invalid']) {
        expect(await notify('REVOKED', { [key]: value })).toEqual({
          recipients: [],
          eligibilityQueries: 0,
        });
      }
    },
  );
});
