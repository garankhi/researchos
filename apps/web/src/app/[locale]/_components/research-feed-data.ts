import type { OutputResponseDto } from '@/lib/api/models';

export type ResearchFigure = { src: string; number: number };

export type ResearchCardData = {
  id: string;
  title: string;
  type: string;
  publicationYear?: number;
  publicationDate?: string;
  venue?: string;
  publisher?: string;
  publicationUrl?: string;
  detailHref?: string;
  downloadUrl?: string;
  downloadablePdf?: OutputResponseDto['downloadablePdf'];
  authors: { id: string; name: string; userId?: string }[];
  figures?: ResearchFigure[];
  figureSourceUrl?: string;
  reads?: number;
  citations?: number;
  isExample?: boolean;
};

function publicationLink(value: unknown) {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
  } catch {
    // Older revisions may not have a valid external URL.
  }
  return undefined;
}

export function toResearchCard(
  output: OutputResponseDto,
): ResearchCardData | undefined {
  const revision = output.currentRevision;
  if (!revision) return undefined;

  // The generated types represent nullable scalars as objects in this API.
  // Read their actual JSON types at the boundary.
  const rawDoi: unknown = output.doi;
  const doi =
    typeof rawDoi === 'string'
      ? rawDoi.split('/').map(encodeURIComponent).join('/')
      : undefined;
  return {
    id: output.id,
    detailHref: `/outputs/${output.id}`,
    title: revision.title,
    type: revision.outputType,
    publicationYear:
      typeof revision.publicationYear === 'number'
        ? revision.publicationYear
        : undefined,
    venue: typeof revision.venue === 'string' ? revision.venue : undefined,
    publisher:
      typeof revision.publisher === 'string' ? revision.publisher : undefined,
    publicationUrl:
      publicationLink(revision.externalUrl) ??
      (doi ? `https://doi.org/${doi}` : undefined),
    downloadablePdf: output.downloadablePdf,
    authors: output.authors.map((author) => ({
      id: author.id,
      name: author.authorNameString,
      userId: typeof author.userId === 'string' ? author.userId : undefined,
    })),
  };
}

const articleUrl = 'https://doi.org/10.3390/math13081270';
const articleFiles =
  'https://pub.mdpi-res.com/mathematics/mathematics-13-01270/article_deploy';

// Example for signed-out readers. The counts are from the reference
// design and do not represent activity on ResearchOS.
export const exampleResearch: ResearchCardData = {
  id: 'example-math13081270',
  title: 'Auto-Probabilistic Mining Method for Siamese Neural Network Training',
  type: 'ARTICLE',
  publicationDate: '2025-04-12',
  publicationUrl: articleUrl,
  downloadUrl: `${articleFiles}/mathematics-13-01270.pdf`,
  venue: 'Mathematics',
  publisher: 'MDPI',
  authors: ['Arseniy Mokin', 'Alexander Sheshkus', 'Vladimir L. Arlazarov'].map(
    (name) => ({ id: name, name }),
  ),
  figures: Array.from({ length: 9 }, (_, index) => ({
    src: `${articleFiles}/html/images/mathematics-13-01270-g00${index + 1}.png`,
    number: index + 1,
  })),
  figureSourceUrl: articleUrl,
  reads: 46,
  citations: 2,
  isExample: true,
};
