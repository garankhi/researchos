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
