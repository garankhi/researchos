import { fileURLToPath } from 'node:url';
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
const standardFontDataUrl =
  fileURLToPath(
    new URL(
      '../../standard_fonts',
      import.meta.resolve('pdfjs-dist/legacy/build/pdf.mjs'),
    ),
  ) + '/';

function text(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/\s+/gu, ' ').trim();
  return cleaned && cleaned.length <= maxLength ? cleaned : undefined;
}

function comparableText(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function matchesTitle(candidate: string, visibleTitle: string): boolean {
  const embedded = comparableText(candidate);
  const visible = comparableText(visibleTitle);
  // Allow a subtitle or typography that only appears in one source.
  return (
    embedded === visible ||
    embedded.startsWith(`${visible} `) ||
    visible.startsWith(`${embedded} `)
  );
}

function matchesByline(candidate: string[], byline: string[]): boolean {
  // Require the visible names to agree while allowing initials and inverted
  // names. Embedded metadata may list additional authors below the first byline.
  const names = candidate.map((name) => comparableText(name).split(' '));
  return byline.every((author) => {
    const [given, ...rest] = comparableText(author).split(' ');
    const surname = rest.at(-1);
    return names.some(
      (words) =>
        surname &&
        words.includes(surname) &&
        words.some(
          (word) =>
            word !== surname &&
            (word === given ||
              (word.length === 1 && given.startsWith(word)) ||
              (given.length === 1 && word.startsWith(given))),
        ),
    );
  });
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

const doiLine =
  /^(?:doi[ \t]*:[ \t]*|(?=https?:\/\/(?:dx\.)?doi\.org\/))(\S+)$/iu;
const citationDoi =
  /(?:^|\s)(?:doi[ \t]*:[ \t]*|(?=https?:\/\/(?:dx\.)?doi\.org\/))(\S+)/giu;
const citationHeading = /^(?:citation|cite this article)(?:\s*:|$)/iu;
const citationEnd =
  /^(?:editor|received|accepted|published|copyright|funding|competing interests|data availability(?: statement)?)\s*:/iu;
const bodyHeading =
  /^(?:(?:\d+(?:\.\d+)*|[ivxlcdm]+)[.)]?\s+)?(?:introduction|nomenclature|materials and methods|methods|results|discussion|references|bibliography|literature cited|giới thiệu|mở đầu|phương pháp|kết quả|tài liệu tham khảo)\s*[:.]?$/iu;
const captionHeading =
  /^(?:(?:(?:supplementary|supplemental|supporting)\s+)?(?:fig(?:ure)?\.?|table|hình|bảng)\s+(?:[a-z]?\d|[ivxlcdm]+\b)|[a-z]\d+\s+(?:fig(?:ure)?|table)\b)/iu;

function readArticleDoi(firstPage: readonly PdfLine[]): string | undefined {
  const candidates = new Set<string>();
  let citationLine: PdfLine | undefined;
  for (const line of firstPage) {
    if (bodyHeading.test(line.text) || captionHeading.test(line.text)) break;

    // Publishers can print the article's own citation beside the abstract.
    // Track wrapped citation lines by their margin when body text interleaves.
    if (citationHeading.test(line.text)) {
      citationLine = line;
    } else if (
      citationLine &&
      Math.abs(line.left - citationLine.left) <= citationLine.height
    ) {
      const gap = line.y - citationLine.y;
      citationLine =
        gap > 0 &&
        gap <= citationLine.height * 2 &&
        !citationEnd.test(line.text) &&
        !abstractHeading.test(line.text)
          ? line
          : undefined;
    }

    const standalone = doiLine.exec(line.text)?.[1];
    if (standalone) {
      const doi = normalizeArticleDoi(standalone);
      if (doi) candidates.add(doi);
    } else if (line === citationLine) {
      for (const [, source] of line.text.matchAll(citationDoi)) {
        // An inline DOI can be followed by the citation's sentence period.
        const doi = normalizeArticleDoi(source.replace(/\.$/u, ''));
        if (doi) candidates.add(doi);
      }
    }
  }
  return candidates.size === 1 ? candidates.values().next().value : undefined;
}

export async function extractArticlePdfMetadata(
  bytes: Uint8Array,
): Promise<ArticlePdfMetadata> {
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
    const visibleTitle = text(frontMatter.title, 500);
    const byline = frontMatter.authorNames ?? frontMatter.firstByline;
    const title =
      [metadata?.get('dc:title'), infoFields.Title]
        .map((value) => text(value, 500))
        .find(
          (value) =>
            value && (!visibleTitle || matchesTitle(value, visibleTitle)),
        ) ??
      text(/^\s*(?:title|tiêu đề)[ \t]*:[ \t]*(.+)$/imu.exec(body)?.[1], 500) ??
      visibleTitle;
    const authorNames =
      [metadata?.get('dc:creator'), infoFields.Author]
        .map(readAuthorNames)
        .find((names) => names && (!byline || matchesByline(names, byline))) ??
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
      readArticleDoi(pages[0] ?? []);

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
