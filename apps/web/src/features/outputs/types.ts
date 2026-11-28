import type {
  OutputAuthorResponseDto,
  OutputFileResponseDto,
  OutputResponseDto,
  OutputRevisionChangeDto,
  OutputRevisionHistoryResponseDto,
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
  publicationDate?: string | null;
  volume?: string | null;
  issue?: string | null;
  pages?: string | null;
  peerReviewed?: boolean | null;
  externalUrl: string | null;
  outputType: string;
  releasedAt: string | null;
}

export interface OutputDetail {
  id: string;
  doi: string | null;
  ownerId: string | null;
  sharingStatus: OutputResponseDto['sharingStatus'];
  /** Where the work was posted. Fixed at creation. */
  scopeType: OutputResponseDto['scopeType'];
  /** Who may read the work. */
  audience: OutputResponseDto['audience'];
  accessGroupId: string | null;
  firstSharedAt: string | null;
  hasRestrictedPdf: boolean;
  /** Whether the signed-in viewer may change the audience. */
  canChangeVisibility: boolean;
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
  visibility?: OutputFileResponseDto['visibility'];
  isCurrentReleaseAttachment?: boolean;
}

/**
 * The account behind a revision.
 *
 * A revision records who wrote it and who released it, and the history
 * reads as a record of people rather than of rows.
 */
export interface OutputRevisionActor {
  id: string;
  fullName: string;
}

/**
 * One metadata field that a revision changed.
 *
 * The field is named by a stable key so the label can be resolved from the
 * message catalog instead of being shown raw.
 */
export interface OutputRevisionChange {
  field: string;
  previousValue: string | null;
  currentValue: string | null;
}

/**
 * One entry of the edit history of a work.
 */
export interface OutputRevisionHistoryEntry {
  id: string;
  revisionNo: number;
  title: string;
  createdAt: string;
  releasedAt: string | null;
  /** Whether this revision is the one currently pinned. */
  isCurrent: boolean;
  createdBy: OutputRevisionActor;
  releasedBy: OutputRevisionActor | null;
  changes: OutputRevisionChange[];
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
    ownerId: asString(dto.ownerId),
    sharingStatus: dto.sharingStatus,
    scopeType: dto.scopeType,
    audience: dto.audience,
    accessGroupId: asString(dto.accessGroupId),
    firstSharedAt: asString(dto.firstSharedAt),
    hasRestrictedPdf: dto.hasRestrictedPdf === true,
    canChangeVisibility: dto.canChangeVisibility === true,
    revision: rev
      ? {
          id: rev.id,
          title: rev.title,
          abstract: asString(rev.abstract),
          venue: asString(rev.venue),
          publisher: asString(rev.publisher),
          publicationYear: asNumber(rev.publicationYear),
          publicationDate: asString(rev.publicationDate),
          volume: asString(rev.volume),
          issue: asString(rev.issue),
          pages: asString(rev.pages),
          peerReviewed:
            typeof rev.peerReviewed === 'boolean' ? rev.peerReviewed : null,
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
    visibility: dto.visibility,
    isCurrentReleaseAttachment: dto.isCurrentReleaseAttachment,
  };
}

export function mapOutputRevisionChange(
  dto: OutputRevisionChangeDto,
): OutputRevisionChange {
  return {
    field: dto.field,
    previousValue: asString(dto.previousValue),
    currentValue: asString(dto.currentValue),
  };
}

export function mapOutputRevisionHistory(
  dto: OutputRevisionHistoryResponseDto,
): OutputRevisionHistoryEntry {
  return {
    id: dto.id,
    revisionNo: dto.revisionNo,
    title: dto.title,
    createdAt: dto.createdAt,
    releasedAt: asString(dto.releasedAt),
    isCurrent: dto.isCurrent,
    createdBy: {
      id: dto.createdBy.id,
      fullName: dto.createdBy.fullName,
    },
    releasedBy: dto.releasedBy
      ? { id: dto.releasedBy.id, fullName: dto.releasedBy.fullName }
      : null,
    changes: (dto.changes ?? []).map(mapOutputRevisionChange),
  };
}
