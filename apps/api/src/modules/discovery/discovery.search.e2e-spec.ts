import { PrismaService } from '@researchos/database';
import { beforeAll, describe, expect, it } from 'vitest';
import { DiscoveryService } from './discovery.service.js';
import { SearchTab } from './dto/search-query.dto.js';

/**
 * The search query against a real database.
 *
 * The unit tests mock Prisma, so they never see the SQL. A malformed
 * statement — a join in the wrong place, a subquery without its
 * parentheses — passes every mocked test and fails only here.
 */
describe('DiscoveryService against PostgreSQL', () => {
  const prisma = new PrismaService();
  const service = new DiscoveryService(prisma as never);
  let actorId: string;

  beforeAll(async () => {
    const actor = await prisma.users.findFirst({ where: { is_active: true } });
    if (!actor) {
      throw new Error('The database has no active user to search as.');
    }
    actorId = actor.id;
  });

  it('counts every tab without a syntax error', async () => {
    const counts = await service.counts(actorId, { q: 'an' });

    expect(counts.research).toBeGreaterThanOrEqual(0);
    expect(counts.people).toBeGreaterThanOrEqual(0);
    expect(counts.group).toBeGreaterThanOrEqual(0);
    expect(counts.opportunity).toBeGreaterThanOrEqual(0);
  });

  it('returns group results whose subtitle names the leader', async () => {
    const result = await service.search(actorId, {
      tab: SearchTab.GROUP,
      q: 'an',
      page: 1,
      limit: 5,
    });

    for (const item of result.items) {
      expect(item.entityType).toBe('GROUP');
      // The subtitle of a group is its leader, and the client needs the
      // leader's id to link the name to their profile.
      expect(item.subtitleEntityType).toBe('RESEARCHER');
      expect(item.subtitleEntityId).toBeTruthy();
    }
  });

  it('returns opportunity results whose subtitle names the group', async () => {
    const result = await service.search(actorId, {
      tab: SearchTab.OPPORTUNITY,
      q: 'an',
      page: 1,
      limit: 5,
    });

    for (const item of result.items) {
      expect(item.entityType).toBe('OPPORTUNITY');
      // The subtitle of an opportunity is the group that published it.
      expect(item.subtitleEntityType).toBe('GROUP');
      expect(item.subtitleEntityId).toBeTruthy();
    }
  });

  it('resolves an opportunity subtitle to a group that exists', async () => {
    const result = await service.search(actorId, {
      tab: SearchTab.OPPORTUNITY,
      q: 'an',
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
});
