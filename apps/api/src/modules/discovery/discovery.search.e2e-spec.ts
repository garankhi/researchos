import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { ConfigModule } from '@nestjs/config';
import { beforeAll, describe, expect, it } from 'vitest';
import { resolveEnvFilePaths } from '@researchos/config';
import { PrismaService } from '@researchos/database';
import { DiscoveryService } from './discovery.service.js';
import { SearchTab } from './dto/search-query.dto.js';

const { Client } = createRequire(import.meta.resolve('@researchos/database'))(
  'pg',
);

/**
 * The search query against a real database.
 *
 * The unit tests mock Prisma, so they never see the SQL. A malformed
 * statement — a join in the wrong place, a subquery without its
 * parentheses — passes every mocked test and fails only here.
 *
 * The spec runs against its own database, built from the schema source
 * and dropped again afterwards, so it never touches the development data
 * and never leaves fixtures behind.
 */
describe('DiscoveryService against PostgreSQL', () => {
  const leaderId = randomUUID();
  const memberId = randomUUID();
  const groupId = randomUUID();
  const opportunityId = randomUUID();
  const term = 'quantum';

  const originalDatabaseUrl = process.env.DATABASE_URL;
  let prisma: PrismaService;
  let service: DiscoveryService;
  let admin: InstanceType<typeof Client>;
  let database: InstanceType<typeof Client>;
  let databaseName = '';
  let databaseCreated = false;

  beforeAll(async () => {
    await ConfigModule.forRoot({
      envFilePath: resolveEnvFilePaths(resolve(import.meta.dirname, '..')),
    });

    const configuredUrl = process.env.DATABASE_URL;
    if (!configuredUrl) {
      throw new Error('DATABASE_URL is required for the search tests');
    }

    const source = new URL(configuredUrl);
    source.pathname = '/postgres';
    source.searchParams.delete('schema');

    databaseName = `discovery_search_${randomUUID().replaceAll('-', '')}`;
    const databaseUrl = new URL(source);
    databaseUrl.pathname = `/${databaseName}`;

    admin = new Client({ connectionString: source.href });
    database = new Client({ connectionString: databaseUrl.href });

    await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    databaseCreated = true;

    await database.connect();
    await database.query(
      await readFile(
        new URL('../../../../../docs/database/ResearchOS.sql', import.meta.url),
        'utf8',
      ),
    );

    await seed();

    process.env.DATABASE_URL = databaseUrl.href;
    prisma = new PrismaService();
    await prisma.$connect();
    service = new DiscoveryService(prisma as never);
  });

  /**
   * The fixtures a search needs: a group with a leader, a member, and a
   * published opportunity.
   */
  async function seed() {
    await database.query(
      `INSERT INTO users(id, user_type, email, full_name, department_unit)
       VALUES ($1, 'FACULTY', 'leader@example.invalid', 'Quantum Leader', 'Physics'),
              ($2, 'FACULTY', 'member@example.invalid', 'Quantum Member', 'Physics')`,
      [leaderId, memberId],
    );

    await database.query(
      `INSERT INTO researcher_profiles(user_id, bio, profile_confirmed_at)
       VALUES ($1, 'Quantum researcher', now()),
              ($2, 'Quantum researcher', now())`,
      [leaderId, memberId],
    );

    await database.query(
      `INSERT INTO research_groups(id, code, name, lead_id, description)
       VALUES ($1, $2, 'Quantum Lab', $3, 'Quantum materials and photonics.')`,
      [groupId, `DISC-${leaderId.slice(0, 8)}`, leaderId],
    );
    await database.query(
      'INSERT INTO group_members(group_id, user_id) VALUES ($1, $2)',
      [groupId, memberId],
    );

    // The opportunity is created as a draft and published afterwards,
    // because the trigger only allows that transition.
    await database.query(
      `INSERT INTO research_opportunities(
         id, group_id, opportunity_kind, target_audience, creator_id, title, description
       ) VALUES ($1, $2, 'RESEARCH_COLLABORATION', 'ANY_RESEARCHER', $3,
                 'Quantum Fellowship', 'A fellowship on quantum materials.')`,
      [opportunityId, groupId, leaderId],
    );
    await database.query(
      `UPDATE research_opportunities
       SET status = 'OPEN',
           application_deadline = now() + interval '30 days',
           published_at = now()
       WHERE id = $1`,
      [opportunityId],
    );
  }

  it('counts every tab without a syntax error', async () => {
    const counts = await service.counts(leaderId, { q: term });

    expect(counts.research).toBeGreaterThanOrEqual(0);
    expect(counts.people).toBeGreaterThanOrEqual(0);
    expect(counts.group).toBeGreaterThanOrEqual(0);
    expect(counts.opportunity).toBeGreaterThanOrEqual(0);
  });

  it('returns group results whose subtitle names the leader', async () => {
    const result = await service.search(leaderId, {
      tab: SearchTab.GROUP,
      q: term,
      page: 1,
      limit: 5,
    });

    expect(result.items.length).toBeGreaterThan(0);

    for (const item of result.items) {
      expect(item.entityType).toBe('GROUP');
      // The subtitle of a group is its leader, and the client needs the
      // leader's id to link the name to their profile.
      expect(item.subtitleEntityType).toBe('RESEARCHER');
      expect(item.subtitleEntityId).toBeTruthy();
    }
  });

  it('returns opportunity results whose subtitle names the group', async () => {
    const result = await service.search(leaderId, {
      tab: SearchTab.OPPORTUNITY,
      q: term,
      page: 1,
      limit: 5,
    });

    expect(result.items.length).toBeGreaterThan(0);

    for (const item of result.items) {
      expect(item.entityType).toBe('OPPORTUNITY');
      // The subtitle of an opportunity is the group that published it.
      expect(item.subtitleEntityType).toBe('GROUP');
      expect(item.subtitleEntityId).toBeTruthy();
    }
  });

  it('resolves an opportunity subtitle to a group that exists', async () => {
    const result = await service.search(leaderId, {
      tab: SearchTab.OPPORTUNITY,
      q: term,
      page: 1,
      limit: 5,
    });

    for (const item of result.items) {
      const group = await prisma.research_groups.findUnique({
        where: { id: String(item.subtitleEntityId) },
      });

      expect(group).not.toBeNull();
      // The subtitle text is the group's name.
      expect(item.authorsText).toBe(group?.name);
    }
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }

    try {
      await database?.end();
    } finally {
      try {
        if (databaseCreated) {
          await admin.query(`DROP DATABASE "${databaseName}"`);
        }
      } finally {
        await admin?.end();
      }
    }
  });
});
