import type {
  OutputAuthorResponseDto,
  OutputFileResponseDto,
  OutputResponseDto,
  OutputTopicResponseDto,
} from '@/lib/api/models';

/**
 * Outputs feature — public entry point.
 *
 * Barrel is the only import surface other modules may use.
 */

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

export interface OutputAuthor {
  id: string;
  authorNameString: string;
  authorOrder: number;
  isCorrespondingAuthor: boolean;
  userId: string | null;
}

export interface OutputTopic {
  topicId: string;
  topicName: string;
  subfieldId: string;
  subfieldName: string;
  fieldId: string;
  fieldName: string;
}

export interface OutputRevisionSummary {
  id: string;
  title: string;
  abstract: string | null;
  venue: string | null;
  publisher: string | null;
  publicationYear: number | null;
  externalUrl: string | null;
  outputType: string;
  releasedAt: string | null;
}

export interface OutputDetail {
  id: string;
  doi: string | null;
  visibility: OutputResponseDto['visibility'];
  accessGroupId: string | null;
  firstSharedAt: string | null;
  revision: OutputRevisionSummary | null;
  authors: OutputAuthor[];
  topics: OutputTopic[];
}

export interface OutputFile {
  id: string;
  outputId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export function mapAuthor(dto: OutputAuthorResponseDto): OutputAuthor {
  return {
    id: dto.id,
    authorNameString: dto.authorNameString,
    authorOrder: dto.authorOrder,
    isCorrespondingAuthor: dto.isCorrespondingAuthor,
    userId: asString(dto.userId),
  };
}

export function mapTopic(dto: OutputTopicResponseDto): OutputTopic {
  return {
    topicId: dto.topicId,
    topicName: dto.topicName,
    subfieldId: dto.subfieldId,
    subfieldName: dto.subfieldName,
    fieldId: dto.fieldId,
    fieldName: dto.fieldName,
  };
}

export function mapOutputDetail(dto: OutputResponseDto): OutputDetail {
  const rev = dto.currentRevision;
  return {
    id: dto.id,
    doi: asString(dto.doi),
    visibility: dto.visibility,
    accessGroupId: asString(dto.accessGroupId),
    firstSharedAt: asString(dto.firstSharedAt),
    revision: rev
      ? {
          id: rev.id,
          title: rev.title,
          abstract: asString(rev.abstract),
          venue: asString(rev.venue),
          publisher: asString(rev.publisher),
          publicationYear: asNumber(rev.publicationYear),
          externalUrl: asString(rev.externalUrl),
          outputType: rev.outputType,
          releasedAt: asString(rev.releasedAt),
        }
      : null,
    authors: [...(dto.authors ?? [])]
      .sort((a, b) => a.authorOrder - b.authorOrder)
      .map(mapAuthor),
    topics: (dto.topics ?? []).map(mapTopic),
  };
}

export function mapOutputFile(dto: OutputFileResponseDto): OutputFile {
  return {
    id: dto.id,
    outputId: dto.outputId,
    fileName: dto.fileName,
    mimeType: dto.mimeType,
    sizeBytes: dto.sizeBytes,
  };
}
