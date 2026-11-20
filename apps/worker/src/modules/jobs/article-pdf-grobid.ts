import { Logger } from '@nestjs/common';
import {
  normalizeArticleDoi,
  parsePublicationDate,
} from '@researchos/publication-metadata';
import type { ArticlePdfMetadata } from '@researchos/queue';
import { readArticleBibliography } from './article-pdf-bibliography.js';
import {
  comparableArticleText as comparable,
  generatedTitle,
  selectArticleIdentity,
} from './article-pdf-identity.js';
import { selectPublicationDate } from './article-pdf-publication-date.js';
import { SaxesParser, type SaxesAttributeNS } from 'saxes';
import {
  endsArticleHeader,
  personName,
  publicationMasthead,
  readLabeledAuthors,
  type PdfHeaderLine,
} from './article-pdf-layout.js';
import type { PdfEvidence } from './article-pdf-parser.js';

const teiNamespace = 'http://www.tei-c.org/ns/1.0';
const blockElements = new Set(['div', 'head', 'lb', 'p']);
const maxTeiBytes = 512 * 1024;
const logger = new Logger('ArticlePdfGrobid');
const arxivStamp =
  /\barxiv\s*:\s*(?:\d{4}\.\d{4,5}|[a-z.-]+\/\d{7})(?:v\d+)?\b/iu;
const abstractLabel = /^(?:abstract|tóm tắt)(?:\s*$|\s*[:.—–-])/iu;

export interface GrobidSettings {
  endpoint: URL;
  timeoutMs: number;
}

interface TeiElement {
  name: string;
  attributes: Record<string, SaxesAttributeNS>;
  content: Array<string | TeiElement>;
}

function readTeiHeader(xml: string): TeiElement | undefined {
  const parser = new SaxesParser({ xmlns: true });
  const stack: TeiElement[] = [];
  let root: TeiElement | undefined;

  parser.on('doctype', () => {
    throw new Error('Unexpected document type in GROBID response');
  });
  parser.on('opentag', (tag) => {
    if (stack.length >= 64)
      throw new Error('GROBID response is nested too deeply');
    const node: TeiElement = {
      name: tag.uri === teiNamespace ? tag.local : '',
      attributes: tag.attributes,
      content: [],
    };
    const parent = stack.at(-1);
    if (parent) parent.content.push(node);
    else root = node;
    stack.push(node);
  });
  parser.on('closetag', () => stack.pop());
  const appendText = (value: string) => stack.at(-1)?.content.push(value);
  parser.on('text', appendText);
  parser.on('cdata', appendText);
  parser.write(xml).close();

  return root?.name === 'TEI' ? child(root, 'teiHeader') : undefined;
}

function children(node: TeiElement | undefined, name: string): TeiElement[] {
  return (
    node?.content.filter(
      (part): part is TeiElement =>
        typeof part !== 'string' && part.name === name,
    ) ?? []
  );
}

function child(node: TeiElement | undefined, name: string) {
  return children(node, name)[0];
}

function rawText(node: TeiElement): string {
  return node.content
    .map((part) => {
      if (typeof part === 'string') return part;
      const value = rawText(part);
      return blockElements.has(part.name) ? ' ' + value + ' ' : value;
    })
    .join('');
}

function boundedText(node: TeiElement | undefined, maximum: number) {
  const value = node && rawText(node).replace(/\s+/gu, ' ').trim();
  return value && value.length <= maximum ? value : undefined;
}

function oneValue<T extends string>(values: Array<T | null | undefined>) {
  const distinct = new Set(
    values.filter((value): value is T => Boolean(value)),
  );
  return distinct.size === 1 ? distinct.values().next().value : undefined;
}

function nameOnPage(name: string, text: string): string | undefined {
  const words = name.normalize('NFC').match(/[\p{L}\p{M}\p{N}]+/gu);
  if (!words) return undefined;
  const expression = new RegExp(
    '(?<![\\p{L}\\p{M}\\p{N}])' +
      words.join("[\\s.'’\\-]+") +
      '(?![\\p{L}\\p{M}\\p{N}])',
    'iu',
  );
  return expression.exec(text.normalize('NFC'))?.[0].replace(/\s+/gu, ' ');
}

function authorName(
  author: TeiElement,
  visibleText: string,
): string | undefined {
  const person = child(author, 'persName');
  if (!person) return boundedText(child(author, 'orgName'), 255);

  const given = children(person, 'forename')
    .map((part) => boundedText(part, 255))
    .filter(Boolean)
    .join(' ');
  const family = children(person, 'surname')
    .map((part) => boundedText(part, 255))
    .filter(Boolean)
    .join(' ');
  if (!given && !family) return boundedText(person, 255);
  const givenFirst = [given, family].filter(Boolean).join(' ');
  if (givenFirst.length > 255) return undefined;

  // GROBID serializes name components in a fixed order. Use the visible
  // order when the PDF supports a family name before the given names.
  const familyFirst = [family, given].filter(Boolean).join(' ');
  return (
    nameOnPage(givenFirst, visibleText) ??
    nameOnPage(familyFirst, visibleText) ??
    givenFirst
  );
}

function headerLines(page: readonly PdfHeaderLine[]): PdfHeaderLine[] {
  const lines = [...page].sort((a, b) => a.y - b.y || a.left - b.left);
  const heading = lines.find(
    ({ text }) => abstractLabel.test(text) || endsArticleHeader(text),
  );
  return heading ? lines.filter(({ y }) => y < heading.y) : lines;
}

const affiliationMarker = /^[\d\s,.*∗†‡§♢]+$/u;

function coversByline(
  names: readonly string[],
  byline: readonly string[],
): boolean {
  let index = 0;
  for (const author of byline.map(comparable)) {
    let name = names[index++];
    while (name && author.startsWith(name + ' ') && index < names.length) {
      name += ' ' + names[index++];
    }
    if (name !== author) return false;
  }
  return index === names.length;
}

function groundByline(
  names: string[],
  page: readonly PdfHeaderLine[],
  affiliations: ReadonlySet<string>,
): string[] {
  const normalizedNames = names.map(comparable);
  // A display name can refer to more than one person. Retain the separate
  // TEI entries when we cannot distinguish them by name alone.
  if (new Set(normalizedNames).size !== names.length) return names;
  const lines = headerLines(page);
  const markers = lines.filter(({ text }) => affiliationMarker.test(text));
  const normalizedLines = lines.map((line) => ({
    line,
    text: ' ' + comparable(line.text) + ' ',
  }));
  const occurrences = normalizedNames.map((name) =>
    normalizedLines
      .filter(({ text }) => text.includes(' ' + name + ' '))
      .map(({ line }) => line),
  );
  for (let index = 0; index < lines.length; index++) {
    const row = lines[index];
    const byline = readLabeledAuthors(row.text);
    if (!byline || byline.length < 2 || /[,;&]\s*$/u.test(row.text)) continue;
    // An explicit delimiter on the PDF can show where GROBID split
    // one person's name into two consecutive entries.
    if (coversByline(normalizedNames, byline)) return byline;
    if (
      !byline.every((author) => names.some((name) => nameOnPage(name, author)))
    )
      continue;
    const unmatched = names.filter(
      (name) => !byline.some((author) => nameOnPage(name, author)),
    );
    // A delimited byline followed by an affiliation block can be split by
    // GROBID into people plus an organization labeled as another person.
    if (
      byline.length >= 3 &&
      unmatched.length === 1 &&
      lines
        .slice(index + 1)
        .some(
          ({ text, y }) => y - row.y <= row.height * 7 && text.includes('@'),
        )
    ) {
      const next = lines.find(
        (line) => line.y > row.y && !affiliationMarker.test(line.text),
      );
      if (
        next &&
        next.y - row.y <= row.height * 1.5 &&
        nameOnPage(unmatched[0], next.text) &&
        (affiliations.has(comparable(unmatched[0])) ||
          markers.some(
            (marker) =>
              marker.y < next.y &&
              next.y - marker.y <= next.height * 0.65 &&
              marker.right <= next.left &&
              next.left - marker.right <= next.height * 0.5,
          ))
      )
        return byline;
    }
  }

  // Repeated names of institutions in the affiliation rows can look just
  // like people to GROBID. Footnote markers corroborate the actual name rows.
  const marked = occurrences.map((positions) =>
    positions.some((position) =>
      markers.some(
        (marker) =>
          marker.y < position.y &&
          position.y - marker.y <= position.height * 0.65 &&
          marker.left <= position.right + position.height &&
          marker.right >= position.left,
      ),
    ),
  );
  return marked.filter(Boolean).length >= 2
    ? names.filter((_, index) => marked[index] || occurrences[index].length < 2)
    : names;
}

export function readGrobidHeader(
  xml: string,
  firstPageText: string,
  firstPage: readonly PdfHeaderLine[] = [],
): ArticlePdfMetadata {
  const header = readTeiHeader(xml);
  if (!header) throw new Error('GROBID response has no TEI header');
  const file = child(header, 'fileDesc');
  const work = child(child(file, 'sourceDesc'), 'biblStruct');
  const article = child(work, 'analytic');
  const imprint = child(child(work, 'monogr'), 'imprint');
  const titles = children(article, 'title');
  const title =
    oneValue(
      titles
        .filter(({ attributes }) => attributes.type?.value === 'main')
        .map((node) => boundedText(node, 500)),
    ) ??
    oneValue(titles.map((node) => boundedText(node, 500))) ??
    (titles.length === 0
      ? oneValue(
          children(child(file, 'titleStmt'), 'title').map((node) =>
            boundedText(node, 500),
          ),
        )
      : undefined);
  const authors = children(article, 'author');
  const affiliations = new Set(
    authors
      .flatMap((author) => children(author, 'affiliation'))
      .flatMap((affiliation) => children(affiliation, 'orgName'))
      .map((org) => comparable(boundedText(org, 500) ?? '')),
  );
  const names = authors.map((author) => authorName(author, firstPageText));
  const authorNames =
    names.length > 0 &&
    names.length <= 100 &&
    names.every((name) => name !== undefined)
      ? groundByline(names, firstPage, affiliations)
      : undefined;
  const abstract = boundedText(
    child(child(header, 'profileDesc'), 'abstract'),
    20_000,
  );
  // A dated arXiv stamp describes the uploaded revision, including when
  // GROBID labels it as published in the generated TEI.
  const publicationDate = arxivStamp.test(firstPageText)
    ? undefined
    : oneValue(
        children(imprint, 'date')
          .filter(({ attributes }) => attributes.type?.value === 'published')
          .map((date) =>
            parsePublicationDate(
              date.attributes.when?.value ?? boundedText(date, 10) ?? '',
            ),
          ),
      );
  const doi = oneValue(
    [...children(article, 'idno'), ...children(work, 'idno')]
      .filter(
        ({ attributes }) => attributes.type?.value.toLowerCase() === 'doi',
      )
      .map((id) => normalizeArticleDoi(boundedText(id, 512))),
  );

  return {
    ...(title && { title }),
    ...(authorNames && { authorNames }),
    ...(abstract && { abstract }),
    ...(publicationDate && { publicationDate }),
    ...(doi && { doi }),
  };
}
function incompleteAbstract(abstract: string | undefined): boolean {
  return Boolean(
    abstract &&
    (!/[.!?]["'”’)]*$/u.test(abstract) ||
      arxivStamp.test(abstract) ||
      (/\b(?:citation|cite this article):/iu.test(abstract) &&
        /\b(?:editor|received|accepted|copyright|published):/iu.test(
          abstract,
        ))),
  );
}

function matchesAbstractText(first: string, second: string): boolean {
  return unwrapAbstract(first) === unwrapAbstract(second);
}

function unwrapAbstract(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/-\s+(?=\p{Ll})/gu, '')
    .replace(/\s+/gu, '');
}

function suspectByline(
  metadata: ArticlePdfMetadata,
  page: readonly PdfHeaderLine[],
) {
  const { authorNames, title } = metadata;
  if (!authorNames?.length || !title) return false;
  const lines = headerLines(page);
  if (!generatedTitle(title)) {
    const normalizedTitle = comparable(title);
    const titleIndex = lines.findIndex(
      ({ text }) => comparable(text) === normalizedTitle,
    );
    if (titleIndex < 0) return false;
    const titleLine = lines[titleIndex];
    const next = lines
      .slice(titleIndex + 1)
      .find(({ text }) => !affiliationMarker.test(text));
    if (
      !next ||
      next.y - titleLine.y > titleLine.height * 3 ||
      next.right < titleLine.left ||
      next.left > titleLine.right ||
      !readLabeledAuthors(next.text)?.every(personName)
    )
      return false;
  }
  const bylineText =
    ' ' + comparable(lines.map(({ text }) => text).join('\n')) + ' ';
  return !authorNames.some((name) =>
    bylineText.includes(' ' + comparable(name) + ' '),
  );
}

export function mergeGrobidMetadata(
  metadata: ArticlePdfMetadata,
  evidence: PdfEvidence,
  xml: string,
): ArticlePdfMetadata {
  const firstPageText = [...evidence.firstPage]
    .sort((a, b) => a.y - b.y || a.left - b.left)
    .map(({ text }) => text)
    .join('\n');
  const candidate = readGrobidHeader(xml, firstPageText, evidence.firstPage);
  const visibleBylineText = headerLines(evidence.firstPage)
    .map(({ text }) => text)
    .join('\n');
  const suspectAuthors = suspectByline(metadata, evidence.firstPage);
  const { title, authorNames } = selectArticleIdentity(
    [
      {
        title: metadata.title,
        authorNames: suspectAuthors ? undefined : metadata.authorNames,
      },
      {
        title:
          candidate.title && !publicationMasthead.test(candidate.title)
            ? candidate.title
            : undefined,
        authorNames:
          !suspectAuthors ||
          candidate.authorNames?.every((name) =>
            nameOnPage(name, visibleBylineText),
          )
            ? candidate.authorNames
            : undefined,
      },
    ],
    evidence.visibleIdentity ?? {},
  );
  const visible = evidence.visibleAbstract;
  const tei = candidate.abstract;
  const recoveredAbstract =
    visible &&
    tei &&
    unwrapAbstract(tei).includes(unwrapAbstract(visible)) &&
    unwrapAbstract(firstPageText).includes(unwrapAbstract(tei))
      ? tei
      : (visible ?? tei);
  const abstract =
    recoveredAbstract &&
    (!metadata.abstract ||
      incompleteAbstract(metadata.abstract) ||
      matchesAbstractText(metadata.abstract, recoveredAbstract))
      ? recoveredAbstract
      : metadata.abstract;
  const { doi, dateLines } = readArticleBibliography(
    evidence.firstPage,
    evidence.firstPageHeight,
    metadata.doi,
    candidate.doi,
  );
  const publicationDate = selectPublicationDate(
    dateLines,
    metadata.publicationDate,
  );
  return {
    ...(title && { title }),
    ...(authorNames && { authorNames }),
    ...(abstract && { abstract }),
    ...(publicationDate && { publicationDate }),
    ...(doi && { doi }),
  };
}

export type GrobidHeaderInput = {
  metadata: ArticlePdfMetadata;
  evidence: PdfEvidence;
  xml: string;
};
type MapGrobidHeader = (
  input: GrobidHeaderInput,
  signal: AbortSignal,
) => Promise<ArticlePdfMetadata>;

async function readTeiResponse(
  response: Response,
): Promise<string | undefined> {
  if (response.status !== 200 || !response.body) {
    await response.body?.cancel();
    logger.debug(
      'GROBID did not return a header (HTTP ' + response.status + ')',
    );
    return undefined;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let xml = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return xml + decoder.decode();
      bytes += chunk.value.byteLength;
      if (bytes > maxTeiBytes) throw new Error('GROBID header is too large');
      xml += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    await reader.cancel();
  }
}

export async function enrichArticlePdfMetadata(
  metadata: ArticlePdfMetadata,
  evidence: PdfEvidence,
  pdf: Blob,
  settings: GrobidSettings,
  deadline: AbortSignal,
  mapHeader: MapGrobidHeader,
): Promise<ArticlePdfMetadata> {
  if (
    deadline.aborted ||
    !evidence.hasText ||
    (metadata.title &&
      metadata.authorNames?.length &&
      metadata.abstract &&
      !generatedTitle(metadata.title) &&
      !incompleteAbstract(metadata.abstract) &&
      !suspectByline(metadata, evidence.firstPage))
  ) {
    return metadata;
  }

  try {
    const expiresAt = performance.now() + settings.timeoutMs;
    const body = new FormData();
    body.set('input', pdf, 'article.pdf');
    body.set('consolidateHeader', '0');
    const signal = AbortSignal.any([
      deadline,
      AbortSignal.timeout(settings.timeoutMs),
    ]);
    const response = await fetch(settings.endpoint, {
      method: 'POST',
      headers: { accept: 'application/xml' },
      body,
      redirect: 'error',
      signal,
    });
    const xml = await readTeiResponse(response);
    if (!xml) return metadata;
    signal.throwIfAborted();

    const result = await mapHeader({ metadata, evidence, xml }, signal);
    signal.throwIfAborted();
    return performance.now() < expiresAt ? result : metadata;
  } catch {
    logger.debug('GROBID did not return usable Article PDF metadata');
    return metadata;
  }
}
