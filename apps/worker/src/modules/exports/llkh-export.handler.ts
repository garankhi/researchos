import { Logger } from '@nestjs/common';
import type { Prisma } from '@researchos/database';
import { LLKH_CONTENT_TYPES, type LlkhFormat } from '@researchos/queue';
import { createS3Storage, type StorageAdapter } from '@researchos/storage';
import { renderLlkh, type LlkhData } from './llkh-template.js';

const logger = new Logger('LlkhExport');
let storage: StorageAdapter | undefined;

function authorNames(snapshot: Prisma.JsonValue): string {
  if (!Array.isArray(snapshot)) return '';
  return snapshot
    .flatMap((author) =>
      author &&
      typeof author === 'object' &&
      !Array.isArray(author) &&
      typeof author.name === 'string' &&
      typeof author.order === 'number'
        ? [{ name: author.name, order: author.order }]
        : [],
    )
    .sort((a, b) => a.order - b.order)
    .map(({ name }) => name)
    .join(', ');
}

async function fetchData(
  tx: Prisma.TransactionClient,
  ownerId: string,
): Promise<LlkhData> {
  const user = await tx.users.findUniqueOrThrow({
    where: { id: ownerId },
    select: {
      full_name: true,
      email: true,
      academic_title: true,
      academic_degree: true,
      department_unit: true,
      researcher_profiles: {
        select: { orcid_id: true, scopus_author_id: true, bio: true },
      },
      research_interests: {
        where: { status: 'ACTIVE' },
        select: { research_topics: { select: { name: true } } },
        orderBy: { research_topics: { name: 'asc' } },
      },
    },
  });
  const outputs = await tx.research_outputs.findMany({
    where: {
      archived_at: null,
      OR: [
        { sharing_status: 'DRAFT', owner_id: ownerId },
        {
          sharing_status: 'SHARED',
          audience: 'FPTU_COMMUNITY',
          OR: [
            { owner_id: ownerId },
            { output_authors: { some: { user_id: ownerId } } },
          ],
        },
      ],
    },
    select: {
      doi: true,
      sharing_status: true,
      output_external_ids: { select: { source: true } },
      output_authors: {
        select: { author_name_string: true },
        orderBy: { author_order: 'asc' },
      },
      output_revisions_output_revisions_output_idToresearch_outputs: {
        where: {
          released_at: null,
          research_outputs_output_revisions_output_idToresearch_outputs: {
            owner_id: ownerId,
            sharing_status: 'DRAFT',
          },
        },
      },
      output_revisions_research_outputs_id_current_release_idTooutput_revisions: true,
    },
    orderBy: [{ updated_at: 'desc' }, { id: 'asc' }],
  });
  return {
    profile: [
      ['Họ và tên', user.full_name],
      ['Học hàm', user.academic_title ?? ''],
      ['Học vị', user.academic_degree ?? ''],
      ['Đơn vị', user.department_unit],
      ['Email', user.email],
      ['ORCID', user.researcher_profiles?.orcid_id ?? ''],
      ['Scopus Author ID', user.researcher_profiles?.scopus_author_id ?? ''],
    ],
    academic: [
      [
        'Hướng nghiên cứu',
        user.research_interests
          .map((interest) => interest.research_topics.name)
          .join(', '),
      ],
      ['Giới thiệu', user.researcher_profiles?.bio ?? ''],
    ],
    outputs: outputs.flatMap((output) => {
      const draft = output.sharing_status === 'DRAFT';
      const revision = draft
        ? output
            .output_revisions_output_revisions_output_idToresearch_outputs[0]
        : output.output_revisions_research_outputs_id_current_release_idTooutput_revisions;
      if (!revision) return [];
      const byline = authorNames(revision.authors_snapshot);
      return [
        {
          type: revision.output_type,
          venue: revision.venue,
          publisher: revision.publisher,
          sources: output.output_external_ids.map(({ source }) => source),
          peerReviewed: revision.peer_reviewed,
          doi: output.doi,
          title: revision.title,
          authors:
            byline ||
            (draft
              ? output.output_authors
                  .map((author) => author.author_name_string)
                  .join(', ')
              : ''),
          date:
            revision.publication_date ||
            String(revision.publication_year ?? ''),
          status: output.sharing_status,
          url: revision.external_url,
        },
      ];
    }),
  };
}

export async function renderWithFallback(
  data: LlkhData,
  format: LlkhFormat,
  render = renderLlkh,
) {
  try {
    return { buffer: await render(data, format, true), exportLevel: 2 };
  } catch (error) {
    logger.warn(
      `Formatted LLKH render failed: ${error instanceof Error ? error.name : 'unknown error'}`,
    );
    return { buffer: await render(data, format, false), exportLevel: 1 };
  }
}

export async function handleLlkhExport(
  tx: Prisma.TransactionClient,
  job: Prisma.background_jobsGetPayload<undefined>,
) {
  const payload = job.payload as { format?: unknown } | null;
  const format = payload?.format;
  if (format !== 'docx' && format !== 'xlsx')
    return { error: new Error('Invalid LLKH format') };
  // System jobs have no owner and never reach this handler.
  const ownerId = job.owner_id;
  if (!ownerId) return { error: new Error('LLKH export requires a job owner') };
  const fileKey = `exports/llkh/${ownerId}/${job.id}/${job.generation}.${format}`;
  let exportLevel: number;
  try {
    const data = await fetchData(tx, ownerId);
    const rendered = await renderWithFallback(data, format);
    exportLevel = rendered.exportLevel;
    await (storage ??= createS3Storage()).putObject(
      fileKey,
      rendered.buffer,
      LLKH_CONTENT_TYPES[format],
      // A retried transaction may already have written this job generation's file.
      { overwrite: true },
    );
  } catch (error) {
    return {
      error: error instanceof Error ? error : new Error('LLKH export failed'),
    };
  }
  const exportedAt = new Date();
  await tx.researcher_profiles.updateMany({
    where: {
      user_id: ownerId,
      OR: [
        { llkh_last_exported_at: null },
        { llkh_last_exported_at: { lt: exportedAt } },
      ],
    },
    data: { llkh_last_exported_at: exportedAt },
  });
  return {
    result: {
      fileKey,
      exportLevel,
      format,
      exportedAt: exportedAt.toISOString(),
    },
  };
}
