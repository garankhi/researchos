import { normalizeArticleDoi } from '@researchos/publication-metadata';
import { comparableArticleText } from './article-pdf-identity.js';
import {
  abstractHeading,
  endsArticleHeader,
  type PdfHeaderLine,
} from './article-pdf-layout.js';

const doiLabel = /^(?:doi\s*:\s*|digital object identifier\s*:?\s*)/iu;
const doiUrl = /^https?:\/\/(?:dx\.)?doi\.org\//iu;
const citationDoi =
  /(?:^|\s)(?:doi\s*:\s*|(?=https?:\/\/(?:dx\.)?doi\.org\/))(\S+)/giu;
const citationHeading = /^(?:citation|cite this article|trích dẫn)(?:\s*:|$)/iu;
const citationEnd =
  /^(?:editors?|academic editors?|received|accepted|published|copyright|funding|competing interests|data availability(?: statement)?)\s*:/iu;
const manuscriptHistory =
  /^(?:received|revised|accepted|submitted|ngày nhận|ngày duyệt)(?=\s|:|$)/iu;
const referencesHeading =
  /^(?:(?:\d+|[ivxlcdm]+)[.)]?\s+)?(?:references|bibliography|literature cited|tài liệu tham khảo)\s*[:.]?$/iu;
const runningImprint =
  /^\p{L}[\p{L}\p{M}. -]*\s+(?:19|20)\d{2}\s*,\s*\d+\s*,\s*[\p{L}\d.-]+$/u;
const inlineImprint = /^(.+?)\s+(https?:\/\/(?:dx\.)?doi\.org\/\S+)$/iu;
const paginatedDoi =
  /^\p{L}[^|]{0,90}\|\s*doi:\s*(\S+)\s+\p{L}+\s+\d{1,2},\s+\d{4}\s+\d+\s*\/\s*\d+$/iu;
const keywords = /^(?:keywords?|index terms|từ khóa)(?=$|[\s:])/iu;

interface BibliographyContext {
  pageHeight?: number;
  embeddedDoi?: string | null;
  teiDoi?: string;
  title?: string;
}

function sameMargin(first: PdfHeaderLine, second: PdfHeaderLine) {
  return Math.abs(first.left - second.left) <= first.height * 1.4;
}

function continuation(
  page: readonly PdfHeaderLine[],
  line: PdfHeaderLine,
  maxGap = 2.2,
) {
  return page.find(
    (next) =>
      next.y > line.y &&
      next.y - line.y <= line.height * maxGap &&
      sameMargin(line, next),
  );
}

function linkedDoi(text: string, next?: string) {
  if (!doiLabel.test(text) && !doiUrl.test(text)) return undefined;
  const value = text.replace(doiLabel, '').trim();
  const doi = normalizeArticleDoi(value);
  if (doi && !value.endsWith('/')) return doi;

  if (
    (!value || value.endsWith('/')) &&
    next &&
    /^[\p{L}\d][\p{L}\d._;()/+%-]*\.?$/u.test(next)
  ) {
    return normalizeArticleDoi(value + next.replace(/\.$/u, ''));
  }
  return undefined;
}

function readSelfCitations(
  page: readonly PdfHeaderLine[],
  title: string | undefined,
) {
  const normalizedTitle =
    title && comparableArticleText(title).replace(/\s/gu, '');
  const dois: string[] = [];
  const citationLines = new Set<PdfHeaderLine>();
  for (const line of page) {
    if (!citationHeading.test(line.text)) continue;
    const block = [line];
    let previous = line;
    for (let count = 0; count < 12; count++) {
      const next = continuation(page, previous);
      if (
        !next ||
        citationEnd.test(next.text) ||
        endsArticleHeader(next.text) ||
        abstractHeading.test(next.text) ||
        keywords.test(next.text)
      )
        break;
      block.push(next);
      previous = next;
    }
    for (const part of block) citationLines.add(part);
    const citation = block.map((part) => part.text).join(' ');
    if (
      !normalizedTitle ||
      !comparableArticleText(citation)
        .replace(/\s/gu, '')
        .includes(normalizedTitle)
    )
      continue;
    for (const [, source] of citation.matchAll(citationDoi)) {
      if (source.endsWith('/')) continue;
      const doi = normalizeArticleDoi(source.replace(/\.$/u, ''));
      if (doi) dois.push(doi);
    }
    for (const [index, part] of block.entries()) {
      const doi = linkedDoi(part.text, block[index + 1]?.text);
      if (doi) dois.push(doi);
    }
  }
  return { dois, citationLines };
}

export function readArticleBibliography(
  firstPage: readonly PdfHeaderLine[],
  { pageHeight, embeddedDoi, teiDoi, title }: BibliographyContext,
): { doi?: string; dateLines: string[] } {
  const page = [...firstPage].sort((a, b) => a.y - b.y || a.left - b.left);
  const boundary = page.find(({ text }) => endsArticleHeader(text));
  const references = page.find(({ text }) => referencesHeading.test(text));
  const header = boundary ? page.filter(({ y }) => y < boundary.y) : page;
  const { dois, citationLines } = readSelfCitations(header, title);
  const candidates = new Set(dois);
  const dates = new Set<PdfHeaderLine>();
  let inAbstract: PdfHeaderLine | undefined;

  for (const line of header) {
    if (abstractHeading.test(line.text)) inAbstract = line;
    else if (
      keywords.test(line.text) &&
      inAbstract &&
      sameMargin(inAbstract, line)
    )
      inAbstract = undefined;

    if (citationLines.has(line) || (inAbstract && sameMargin(inAbstract, line)))
      continue;
    dates.add(line);
    const standalone = linkedDoi(line.text, continuation(header, line)?.text);
    if (standalone) candidates.add(standalone);
    else if (!inAbstract && teiDoi && normalizeArticleDoi(line.text) === teiDoi)
      candidates.add(teiDoi);
  }

  if (pageHeight && !references) {
    const footer = page.filter(({ y }) => y >= pageHeight * 0.72);
    for (const anchor of footer) {
      const [, imprint, inlineLink] = inlineImprint.exec(anchor.text) ?? [];
      const inlineRunningDoi =
        title && anchor.y >= pageHeight * 0.91
          ? normalizeArticleDoi(
              (imprint && runningImprint.test(imprint)
                ? inlineLink
                : undefined) ?? paginatedDoi.exec(anchor.text)?.[1],
            )
          : undefined;
      const doi =
        inlineRunningDoi ??
        linkedDoi(anchor.text, continuation(footer, anchor)?.text);
      if (!doi) continue;
      const nearby = footer.filter(
        (line) =>
          Math.abs(line.y - anchor.y) <= anchor.height * 5 &&
          sameMargin(anchor, line),
      );
      const lifecycleFooter = nearby.some(({ text }) =>
        manuscriptHistory.test(text),
      );
      const runningFooter =
        inlineRunningDoi ||
        Boolean(
          title &&
          anchor.y >= pageHeight * 0.91 &&
          footer.some(
            (line) =>
              Math.abs(line.y - anchor.y) <= anchor.height * 0.5 &&
              line.right < anchor.left &&
              runningImprint.test(line.text),
          ),
        );
      if (!lifecycleFooter && !runningFooter) continue;
      candidates.add(doi);
      for (const line of nearby) dates.add(line);
      if (runningFooter) {
        // Publication details can finish in a separate margin below the main
        // article heading. Require a nearby manuscript event in that margin.
        for (const line of footer.filter(({ text }) =>
          manuscriptHistory.test(text),
        )) {
          for (const sibling of footer) {
            if (
              Math.abs(sibling.y - line.y) <= line.height * 7 &&
              sameMargin(line, sibling)
            )
              dates.add(sibling);
          }
        }
      }
    }
  }

  return {
    doi:
      candidates.size > 1
        ? undefined
        : (candidates.values().next().value ?? embeddedDoi ?? undefined),
    dateLines: [...dates]
      .sort((a, b) => a.y - b.y || a.left - b.left)
      .map((line) => {
        const next = continuation(page, line);
        return next && /[:—–-]\s*$/u.test(line.text)
          ? line.text + ' ' + next.text
          : line.text;
      }),
  };
}
