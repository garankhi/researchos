import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { FinalizeOnboardingDto } from './finalize-onboarding.dto.js';
import {
  AFFILIATION_MAX_YEAR,
  AFFILIATION_MIN_YEAR,
} from './onboarding-affiliation.dto.js';

/**
 * The affiliation payload of the finalize call.
 *
 * The affiliation timeline is the one part of the OpenAlex record the
 * researcher may correct, so the payload has to be strict about what it
 * accepts: a bad year would be stored as a fact about the researcher's
 * career, and the years are the only thing the platform actually reads.
 */
const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  errorFormat: 'grouped',
});

/** The body of a finalize call with one affiliation. */
function body(affiliation: Record<string, unknown>): Record<string, unknown> {
  return { topicIds: ['topic-1'], affiliations: [affiliation] };
}

describe('the onboarding affiliation payload', () => {
  it('accepts an affiliation the researcher typed', async () => {
    await expect(
      pipe.transform(body({ institutionId: 'I1', name: 'FPT University' }), {
        type: 'body',
        metatype: FinalizeOnboardingDto,
      }),
    ).resolves.toBeInstanceOf(FinalizeOnboardingDto);
  });

  it('accepts a numeric string as a year', async () => {
    // The frontend sends the years it read from OpenAlex, and a form
    // that renders them as text sends strings.
    const dto = (await pipe.transform(
      body({
        institutionId: 'I1',
        name: 'FPT University',
        yearStart: '2020',
        yearEnd: '2026',
      }),
      { type: 'body', metatype: FinalizeOnboardingDto },
    )) as FinalizeOnboardingDto;

    expect(dto.affiliations?.[0]?.yearStart).toBe(2020);
    expect(dto.affiliations?.[0]?.yearEnd).toBe(2026);
  });

  it('rejects a year that is not a number', async () => {
    await expect(
      pipe.transform(
        body({ institutionId: 'I1', name: 'X', yearStart: 'n/a' }),
        {
          type: 'body',
          metatype: FinalizeOnboardingDto,
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an absurd year', async () => {
    await expect(
      pipe.transform(
        body({ institutionId: 'I1', name: 'X', yearStart: 999999 }),
        { type: 'body', metatype: FinalizeOnboardingDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a year before the tenth century', async () => {
    await expect(
      pipe.transform(body({ institutionId: 'I1', name: 'X', yearStart: 900 }), {
        type: 'body',
        metatype: FinalizeOnboardingDto,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an institution without an id', async () => {
    await expect(
      pipe.transform(body({ name: 'FPT University' }), {
        type: 'body',
        metatype: FinalizeOnboardingDto,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a country code that is not two characters', async () => {
    await expect(
      pipe.transform(
        body({ institutionId: 'I1', name: 'X', countryCode: 'VNM' }),
        { type: 'body', metatype: FinalizeOnboardingDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an institution type the platform does not store', async () => {
    await expect(
      pipe.transform(
        body({ institutionId: 'I1', name: 'X', institutionType: 'SPACE' }),
        { type: 'body', metatype: FinalizeOnboardingDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a year at the edges of the range', async () => {
    await expect(
      pipe.transform(
        body({
          institutionId: 'I1',
          name: 'X',
          yearStart: AFFILIATION_MIN_YEAR,
          yearEnd: AFFILIATION_MAX_YEAR,
        }),
        { type: 'body', metatype: FinalizeOnboardingDto },
      ),
    ).resolves.toBeInstanceOf(FinalizeOnboardingDto);
  });
});
