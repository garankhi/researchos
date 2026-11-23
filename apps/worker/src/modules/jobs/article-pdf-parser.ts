import { fileURLToPath } from 'node:url';
import { parentPort, workerData } from 'node:worker_threads';
import { domainErrorCodes } from '@researchos/error-codes';
import { normalizeArticleDoi } from '@researchos/publication-metadata';
import type { ArticlePdfMetadata } from '@researchos/queue';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  abstractHeading,
  matchesArticleHeading,
  readAbstract,
  readArticleHeader,
  readAuthorNames,
  readFrontMatter,
  readHeadinglessAbstract,
  readLabeledAuthors,
  readPdfLines,
  type FrontMatter,
  type PdfHeaderLine,
  type PdfLine,
  type PdfTextRun,
} from './article-pdf-layout.js';
import { readArticleBibliography } from './article-pdf-bibliography.js';
import {
  comparableAbstractText,
  selectArticleIdentity,
} from './article-pdf-identity.js';
import {
  readEmbeddedPublicationDate,
  selectPublicationDate,
} from './article-pdf-publication-date.js';

const errors = domainErrorCodes.storage;
const maxPages = 5;
const maxTextLength = 50_000;
const standardFontDataUrl =
  fileURLToPath(
    new URL(
      '../../standard_fonts',
      import.meta.resolve('pdfjs-dist/legacy/build/pdf.mjs'),
    ),
  ) + '/';

export interface PdfEvidence {
  firstPage: PdfHeaderLine[];
  firstPageHeight?: number;
  hasText: boolean;
  visibleAbstract?: string;
  visibleIdentity?: FrontMatter;
}

type PdfInspection = { metadata: ArticlePdfMetadata; evidence?: PdfEvidence };
export type PdfParserInput = { bytes: Uint8Array; collectEvidence: boolean };

function text(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/\s+/gu, ' ').trim();
  return cleaned && cleaned.length <= maxLength ? cleaned : undefined;
}

export async function extractArticlePdfMetadata(
  bytes: Uint8Array,
): Promise<ArticlePdfMetadata> {
  return (await inspectArticlePdf(bytes, false)).metadata;
}

export async function inspectArticlePdf(
  bytes: Uint8Array,
  collectEvidence: boolean,
): Promise<PdfInspection> {
  const task = getDocument({
    data: bytes,
    stopAtErrors: true,
    useSystemFonts: false,
    standardFontDataUrl,
  });
  try {
    const pdf = await task.promise;
    const { info, metadata } = await pdf.getMetadata();
    const infoFields = info as Record<string, unknown>;
    if (infoFields.EncryptFilterName)
      throw new Error(errors.articlePdfMetadataEncrypted);

    const pages: PdfLine[][] = [];
    let firstPageHeight: number | undefined;
    let characters = 0;
    for (
      let pageNo = 1;
      pageNo <= Math.min(pdf.numPages, maxPages) && characters < maxTextLength;
      pageNo++
    ) {
      const page = await pdf.getPage(pageNo);
      const viewport = page.getViewport({ scale: 1 });
      if (pageNo === 1) firstPageHeight = viewport.height;
      const runs: PdfTextRun[] = [];
      const reader = page.streamTextContent().getReader();
      let separated = false;
      try {
        while (characters < maxTextLength) {
          const chunk = await reader.read();
          if (chunk.done) break;
          for (const item of chunk.value.items) {
            if (!('str' in item)) continue;
            const raw = item.str.slice(0, maxTextLength - characters);
            const value = raw.trim();
            characters += value.length + 1;
            if (value) {
              const [x, y] = viewport.convertToViewportPoint(
                item.transform[4],
                item.transform[5],
              );
              runs.push({
                text: value,
                x,
                y,
                width: item.width,
                height: item.height,
                spaceBefore: separated || /^\s/u.test(raw),
              });
            }
            separated = !item.hasEOL && /\s$/u.test(raw);
            if (characters >= maxTextLength) break;
          }
        }
      } finally {
        await reader.cancel();
        page.cleanup();
      }
      pages.push(readPdfLines(runs, viewport.width));
    }

    const lines = pages.flat();
    const body = lines.map(({ text }) => text).join('\n');
    const firstPage = pages[0] ?? [];
    const frontMatter = readFrontMatter(firstPage);
    const headerLines = readArticleHeader(firstPage);
    const header = headerLines.map(({ text }) => text).join('\n');
    const visibleIdentity = {
      ...frontMatter,
      title:
        text(
          frontMatter.title?.replace(/^(?:title|tiêu đề)\s*:\s*/iu, ''),
          500,
        ) ??
        text(/^(?:title|tiêu đề)[ \t]*:[ \t]*(.+)$/imu.exec(header)?.[1], 500),
      authorNames:
        frontMatter.authorNames ??
        readLabeledAuthors(
          /^(?:authors?|tác giả)[ \t]*:[ \t]*(.+)$/imu.exec(header)?.[1],
        ),
    };
    const hasVisibleByline = Boolean(
      visibleIdentity.authorNames ?? visibleIdentity.firstByline,
    );
    const infoTitle = text(infoFields.Title, 500);
    const creators = metadata?.get('dc:creator');
    const { title, authorNames } = selectArticleIdentity(
      [
        {
          origin: 'xmp',
          title: text(metadata?.get('dc:title'), 500),
          authorNames: Array.isArray(creators)
            ? readAuthorNames(creators)
            : undefined,
        },
        {
          origin: 'pdf-info',
          title: infoTitle,
          headingMatched:
            !!infoTitle &&
            !visibleIdentity.title &&
            matchesArticleHeading(infoTitle, headerLines),
          authorNames: hasVisibleByline
            ? readAuthorNames(infoFields.Author)
            : undefined,
        },
      ],
      visibleIdentity,
    );
    const printedAbstract = text(
      readAbstract(pages) ??
        (hasVisibleByline ? readHeadinglessAbstract(firstPage) : undefined),
      20_000,
    );
    const labeledAbstract = text(metadata?.get('dcterms:abstract'), 20_000);
    const embeddedAbstract =
      text(infoFields.Subject, 20_000) ??
      text(
        abstractHeading.exec(
          text(metadata?.get('dc:description'), 20_000) ?? '',
        )?.[1],
        20_000,
      );
    const corroboratedAbstract = [labeledAbstract, embeddedAbstract].find(
      (source) =>
        source &&
        printedAbstract &&
        comparableAbstractText(source) ===
          comparableAbstractText(printedAbstract),
    );
    const abstract = corroboratedAbstract ?? printedAbstract;
    const embeddedDoi =
      normalizeArticleDoi(metadata?.get('prism:doi')) ??
      normalizeArticleDoi(metadata?.get('dc:identifier'));
    const { doi: articleDoi, dateLines } = readArticleBibliography(firstPage, {
      pageHeight: firstPageHeight,
      embeddedDoi,
      title,
    });
    const published = selectPublicationDate(
      dateLines,
      readEmbeddedPublicationDate(metadata?.get('prism:publicationdate')),
    );

    const result: PdfInspection = {
      metadata: {
        ...(title && { title }),
        ...(authorNames && { authorNames }),
        ...(abstract && { abstract }),
        ...(published && { publicationDate: published }),
        ...(articleDoi && { doi: articleDoi }),
      },
    };
    if (collectEvidence) {
      result.evidence = {
        firstPage: firstPage.map(
          ({ text, y, height, left, right, column }) => ({
            text,
            y,
            height,
            left,
            right,
            column,
          }),
        ),
        firstPageHeight,
        visibleIdentity,
        hasText: (body.match(/\p{L}[\p{L}\p{M}]+/gu)?.length ?? 0) >= 5,
        visibleAbstract: printedAbstract,
      };
    }
    return result;
  } finally {
    await task.destroy();
  }
}

if (parentPort) {
  try {
    const { bytes, collectEvidence } = workerData as PdfParserInput;
    const header = Buffer.from(bytes.subarray(0, 1024)).toString('latin1');
    if (!header.includes('%PDF-')) {
      parentPort.postMessage({ error: errors.articlePdfMetadataUnsupported });
    } else {
      parentPort.postMessage(await inspectArticlePdf(bytes, collectEvidence));
    }
  } catch (error) {
    const encrypted =
      error instanceof Error &&
      (error.name === 'PasswordException' ||
        error.message === errors.articlePdfMetadataEncrypted);
    parentPort.postMessage({
      error: encrypted
        ? errors.articlePdfMetadataEncrypted
        : errors.articlePdfMetadataCorrupt,
    });
  }
}
