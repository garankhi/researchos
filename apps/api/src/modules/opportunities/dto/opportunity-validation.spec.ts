import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateOpportunityDto } from './create-opportunity.dto.js';
import { UpdateOpportunityDto } from './update-opportunity.dto.js';
import { ListOpportunitiesQueryDto } from './list-opportunities-query.dto.js';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});
const valid = { title: '', opportunityKind: 'RESEARCH_COLLABORATION' };

/**
 * The date-times the API accepts.
 *
 * Every one of them is an RFC 3339 instant: a calendar date, a wall-clock
 * time, and a timezone offset. The form does not matter, the offset does.
 */
const ACCEPTED_DATE_TIMES = [
  '2026-11-07T10:00:00Z',
  '2026-11-07T10:00:00z',
  '2026-11-07T10:00:00+07:00',
  '2026-11-07T10:00:00-05:30',
  '2026-11-07T10:00:00.123Z',
  '2024-02-29T00:00:00Z',
];

/**
 * The date-times the API rejects.
 *
 * The first three are valid ISO 8601 but not valid RFC 3339 instants, and
 * JavaScript cannot parse them into a `Date` at all. The rest name a moment
 * that does not exist, or carry no offset, or are not date-times at all.
 */
const REJECTED_DATE_TIMES = [
  '2026-W45-7',
  '2026-W45',
  '20261107',
  '2026-11-07',
  '2026-11-07T10:00:00',
  '2026-11-07T10:00:00.123',
  '2026-02-30T10:00:00Z',
  '2026-13-01T00:00:00Z',
  '2026-11-07T25:00:00Z',
  '2026-11-07T10:00:60Z',
  '2026-11-07T10:00:00+24:00',
  'not-a-date',
];

describe('Opportunity request validation', () => {
  it('accepts an incomplete draft and nullable fields', async () => {
    await expect(
      pipe.transform(
        { ...valid, description: null },
        { type: 'body', metatype: CreateOpportunityDto },
      ),
    ).resolves.toMatchObject(valid);
  });
  it.each([
    { responseSlaDays: 0 },
    { responseSlaDays: -1 },
    { responseSlaDays: 1.5 },
    { responseSlaDays: null },
    { expectedRole: '  ' },
    { status: 'PUBLISHED' },
    { status: 'OPEN' },
    { status: 'FILLED' },
    { status: 'CLOSED' },
    { status: 'EXPIRED' },
    { publishedAt: '2026-11-07T10:00:00Z' },
    { groupId: 'bad-id' },
    { requiredExpertiseTags: [1] },
    { applicationDeadline: '2026-02-30' },
    { creatorId: 'spoof' },
  ])('rejects invalid create input %j', async (fields) => {
    await expect(
      pipe.transform(
        { ...valid, ...fields },
        { type: 'body', metatype: CreateOpportunityDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it.each([
    { title: null },
    { status: null },
    { status: 'DRAFT' },
    { status: 'OPEN' },
    { status: 'FILLED' },
    { status: 'CLOSED' },
    { status: 'EXPIRED' },
    { publishedAt: '2026-11-07T10:00:00Z' },
    { responseSlaDays: null },
    { groupId: null },
    { creatorId: 'spoof' },
  ])('rejects invalid PATCH input %j', async (fields) => {
    await expect(
      pipe.transform(fields, { type: 'body', metatype: UpdateOpportunityDto }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('allows omitted fields and explicit null for nullable PATCH fields', async () => {
    await expect(
      pipe.transform(
        { description: null, expectedRole: null },
        { type: 'body', metatype: UpdateOpportunityDto },
      ),
    ).resolves.toMatchObject({ description: null, expectedRole: null });
  });
  it.each(ACCEPTED_DATE_TIMES)(
    'accepts the RFC 3339 deadline %s',
    async (applicationDeadline) => {
      await expect(
        pipe.transform(
          { ...valid, applicationDeadline },
          { type: 'body', metatype: CreateOpportunityDto },
        ),
      ).resolves.toMatchObject({ applicationDeadline });
    },
  );
  it.each(REJECTED_DATE_TIMES)(
    'rejects the deadline %s, which is not an RFC 3339 instant',
    async (applicationDeadline) => {
      await expect(
        pipe.transform(
          { ...valid, applicationDeadline },
          { type: 'body', metatype: CreateOpportunityDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
  it.each(REJECTED_DATE_TIMES)(
    'rejects the archive timestamp %s on PATCH as well',
    async (archivedAt) => {
      await expect(
        pipe.transform(
          { archivedAt },
          { type: 'body', metatype: UpdateOpportunityDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
  it.each(ACCEPTED_DATE_TIMES)(
    'accepts the RFC 3339 archive timestamp %s on PATCH',
    async (archivedAt) => {
      await expect(
        pipe.transform(
          { archivedAt },
          { type: 'body', metatype: UpdateOpportunityDto },
        ),
      ).resolves.toMatchObject({ archivedAt });
    },
  );
  it('converts and bounds pagination query values', async () => {
    await expect(
      pipe.transform(
        { page: '2', pageSize: '10' },
        { type: 'query', metatype: ListOpportunitiesQueryDto },
      ),
    ).resolves.toMatchObject({ page: 2, pageSize: 10 });
    await expect(
      pipe.transform(
        { pageSize: '101' },
        { type: 'query', metatype: ListOpportunitiesQueryDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
