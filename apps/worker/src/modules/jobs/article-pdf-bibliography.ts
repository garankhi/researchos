import { normalizeArticleDoi } from '@researchos/publication-metadata';
import {
  abstractHeading,
  endsArticleHeader,
  type PdfHeaderLine,
} from './article-pdf-layout.js';

const doiLine =
  /^(?:doi[ \t]*:[ \t]*|(?=https?:\/\/(?:dx\.)?doi\.org\/))(\S+)$/iu;
const citationDoi =
  /(?:^|\s)(?:doi[ \t]*:[ \t]*|(?=https?:\/\/(?:dx\.)?doi\.org\/))(\S+)/giu;
const citationHeading = /^(?:citation|cite this article)(?:\s*:|$)/iu;
const citationEnd =
  /^(?:editor|received|accepted|published|copyright|funding|competing interests|data availability(?: statement)?)\s*:/iu;
const manuscriptHistory =
  /^(?:received|revised|accepted|ngày nhận|ngày duyệt)(?=\s|:|$)/iu;
const referencesHeading =
  /^(?:(?:\d+|[ivxlcdm]+)[.)]?\s+)?(?:references|bibliography|literature cited|tài liệu tham khảo)\s*[:.]?$/iu;

function linkedDoi(text: string) {
  return normalizeArticleDoi(doiLine.exec(text)?.[1]);
}

export function readArticleBibliography(
  page: readonly PdfHeaderLine[],
  pageHeight?: number,
  embeddedDoi?: string | null,
  teiDoi?: string,
): { doi?: string; dateLines: string[] } {
  const candidates = new Set<string>();
  const dateLines: string[] = [];
  let citationLine: PdfHeaderLine | undefined;
  let inAbstract = false;
  for (const line of page) {
    if (endsArticleHeader(line.text)) break;
    dateLines.push(line.text);
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
    inAbstract ||= abstractHeading.test(line.text);
    const standalone = linkedDoi(line.text);
    if (standalone) candidates.add(standalone);
    else if (line === citationLine) {
      for (const [, source] of line.text.matchAll(citationDoi)) {
        const doi = normalizeArticleDoi(source.replace(/\.$/u, ''));
        if (doi) candidates.add(doi);
      }
    } else if (
      !inAbstract &&
      teiDoi &&
      normalizeArticleDoi(line.text) === teiDoi
    ) {
      candidates.add(teiDoi);
    }
  }

  if (pageHeight) {
    // A publisher can put its article-specific publication block below the
    // body columns. Require the same margin and a local bibliographic anchor.
    const footer = page.filter(({ y }) => y >= pageHeight * 0.72);
    const hasReferences = page.some(({ text }) => referencesHeading.test(text));
    for (const anchor of hasReferences ? [] : footer) {
      const doi = linkedDoi(anchor.text);
      if (!doi || (embeddedDoi && embeddedDoi !== doi && !candidates.has(doi)))
        continue;
      const nearby = footer.filter(
        (line) =>
          Math.abs(line.y - anchor.y) <= anchor.height * 5 &&
          Math.abs(line.left - anchor.left) <= anchor.height * 1.5,
      );
      if (!nearby.some(({ text }) => manuscriptHistory.test(text))) continue;
      candidates.add(doi);
      dateLines.push(...nearby.map(({ text }) => text));
    }
  }

  const visibleDoi =
    candidates.size === 1 ? candidates.values().next().value : undefined;
  return {
    doi:
      candidates.size > 1
        ? undefined
        : (visibleDoi ?? embeddedDoi ?? undefined),
    dateLines,
  };
}
