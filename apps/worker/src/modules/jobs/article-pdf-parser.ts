import { parentPort, workerData } from 'node:worker_threads';
import { domainErrorCodes } from '@researchos/error-codes';
import {
  normalizeArticleDoi,
  parsePublicationDate,
} from '@researchos/publication-metadata';
import type { ArticlePdfMetadata } from '@researchos/queue';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  abstractHeading,
  readAbstract,
  readAuthorNames,
  readFrontMatter,
  readLabeledAuthors,
  readPdfLines,
  type PdfLine,
  type PdfTextRun,
} from './article-pdf-layout.js';

const errors = domainErrorCodes.storage;
const maxPages = 5;
const maxTextLength = 50_000;

function text(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/\s+/gu, ' ').trim();
  return cleaned && cleaned.length <= maxLength ? cleaned : undefined;
}

function publicationDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const candidate = value.trim();
  const timestamp =
    /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$/u.exec(
      candidate,
    );
  // XMP dates describe the calendar day at the source's offset.
  return parsePublicationDate(timestamp?.[1] ?? candidate);
}

export async function extractArticlePdfMetadata(
  bytes: Uint8Array,
): Promise<ArticlePdfMetadata> {
  const task = getDocument({
    data: bytes,
    stopAtErrors: true,
    useSystemFonts: false,
  });
  try {
    const pdf = await task.promise;
    const { info, metadata } = await pdf.getMetadata();
    const infoFields = info as Record<string, unknown>;
    if (infoFields.EncryptFilterName)
      throw new Error(errors.articlePdfMetadataEncrypted);

    const pages: PdfLine[][] = [];
    let characters = 0;
    for (
      let pageNo = 1;
      pageNo <= Math.min(pdf.numPages, maxPages) && characters < maxTextLength;
      pageNo++
    ) {
      const page = await pdf.getPage(pageNo);
      const viewport = page.getViewport({ scale: 1 });
      const runs: PdfTextRun[] = [];
      const reader = page.streamTextContent().getReader();
      try {
        while (characters < maxTextLength) {
          const chunk = await reader.read();
          if (chunk.done) break;
          for (const item of chunk.value.items) {
            if (!('str' in item)) continue;
            const value = item.str.slice(0, maxTextLength - characters).trim();
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
              });
            }
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
    const frontMatter = readFrontMatter(pages[0] ?? []);
    const title =
      text(metadata?.get('dc:title'), 500) ??
      text(infoFields.Title, 500) ??
      text(/^\s*(?:title|tiêu đề)[ \t]*:[ \t]*(.+)$/imu.exec(body)?.[1], 500) ??
      text(frontMatter.title, 500);
    const authorNames =
      readAuthorNames(metadata?.get('dc:creator')) ??
      readAuthorNames(infoFields.Author) ??
      readLabeledAuthors(
        /^\s*(?:authors?|tác giả)[ \t]*:[ \t]*(.+)$/imu.exec(body)?.[1],
      ) ??
      frontMatter.authorNames;
    const abstract =
      text(metadata?.get('dcterms:abstract'), 20_000) ??
      text(readAbstract(pages), 20_000) ??
      text(
        abstractHeading.exec(
          text(metadata?.get('dc:description'), 20_000) ?? '',
        )?.[1],
        20_000,
      );
    const published =
      publicationDate(metadata?.get('prism:publicationdate')) ??
      publicationDate(
        /^\s*(?:published|publication date|ngày xuất bản)[ \t]*:[ \t]*(\d{4}(?:-\d{2}){0,2})[ \t]*$/imu.exec(
          body,
        )?.[1],
      );
    const articleDoi =
      normalizeArticleDoi(metadata?.get('prism:doi')) ??
      normalizeArticleDoi(metadata?.get('dc:identifier')) ??
      normalizeArticleDoi(
        /^\s*(?:doi[ \t]*:[ \t]*|(?=https?:\/\/(?:dx\.)?doi\.org\/))(\S+)[ \t]*$/imu.exec(
          body,
        )?.[1],
      );

    return {
      ...(title && { title }),
      ...(authorNames && { authorNames }),
      ...(abstract && { abstract }),
      ...(published && { publicationDate: published }),
      ...(articleDoi && { doi: articleDoi }),
    };
  } finally {
    await task.destroy();
  }
}

if (parentPort) {
  try {
    const bytes = workerData as Uint8Array;
    const header = Buffer.from(bytes.subarray(0, 1024)).toString('latin1');
    if (!header.includes('%PDF-')) {
      parentPort.postMessage({ error: errors.articlePdfMetadataUnsupported });
    } else {
      parentPort.postMessage({
        metadata: await extractArticlePdfMetadata(bytes),
      });
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
