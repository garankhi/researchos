import { BadRequestException } from '@nestjs/common';
import {
  normalizeArticleDoi,
  parsePublicationDate,
} from '@researchos/publication-metadata';
import type { CreateArticleDto } from './dto/create-article.dto.js';

const DAY_FIRST_DATE = /^(\d{2})-(\d{2})-([1-9]\d{3})$/;

export function normalizePublicationDate(value: string): string {
  const dayFirst = DAY_FIRST_DATE.exec(value);
  const normalized = dayFirst
    ? [dayFirst[3], dayFirst[2], dayFirst[1]].join('-')
    : value;
  const date = parsePublicationDate(normalized);
  if (date) return date;
  throw new BadRequestException({
    message: { publicationDate: ['publication_date_invalid'] },
  });
}

/** Build the stored values in a stable order for the idempotency fingerprint. */
export function normalizeArticleMetadata(dto: CreateArticleDto) {
  const doi = normalizeArticleDoi(dto.doi);
  if (dto.doi && !doi) {
    throw new BadRequestException({ message: { doi: ['doi_invalid'] } });
  }

  return {
    title: dto.title,
    publicationDate: normalizePublicationDate(dto.publicationDate),
    doi,
    abstract: dto.abstract || null,
    journal: dto.journal || null,
    volume: dto.volume || null,
    issue: dto.issue || null,
    pages: dto.pages || null,
    peerReviewed: dto.peerReviewed ?? null,
    authors: dto.authors.map(({ displayName, userId }, index) => ({
      name: displayName,
      order: index + 1,
      userId: userId?.toLowerCase() ?? null,
      isCorresponding: false,
    })),
    topicIds: [...new Set(dto.topicIds?.map((id) => id.toLowerCase()))].sort(),
  };
}
