export interface PdfTextRun {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  spaceBefore?: boolean;
}

export interface PdfLine {
  text: string;
  y: number;
  height: number;
  left: number;
  right: number;
  column?: number;
  runs: PdfTextRun[];
}

type PdfRow = Pick<PdfLine, 'y' | 'height' | 'runs'>;

function joinTextRuns(runs: readonly PdfTextRun[]): string {
  let result = '';
  let previous: PdfTextRun | undefined;
  for (const run of runs) {
    // The same word can span multiple PDF.js items when the page switches
    // glyph maps for an accented letter or changes styling mid-word.
    if (
      previous &&
      !/^[,.;:!?)]/u.test(run.text) &&
      (run.spaceBefore ||
        run.x - (previous.x + previous.width) >
          Math.min(previous.height, run.height) * 0.12)
    ) {
      result += ' ';
    }
    result += run.text;
    previous = run;
  }
  return result;
}

function toLine(row: PdfRow, runs = row.runs): PdfLine {
  return {
    ...row,
    runs,
    height: Math.max(...runs.map(({ height }) => height)),
    text: joinTextRuns(runs),
    left: runs[0].x,
    right: Math.max(...runs.map(({ x, width }) => x + width)),
  };
}

function acrossGutter(row: PdfRow, gutter: number): number {
  const index = row.runs.findIndex(({ x }) => x >= gutter);
  if (index <= 0) return index;
  const rightEdge = Math.max(
    ...row.runs.slice(0, index).map(({ x, width }) => x + width),
  );
  const next = row.runs[index];
  const fontHeight = Math.min(row.runs[index - 1].height, next.height);
  return next.x - rightEdge >= fontHeight * 2 && rightEdge <= gutter
    ? index
    : -1;
}

function findColumns(lines: readonly PdfLine[], pageWidth: number) {
  // Find whitespace supported by text on both sides over the same vertical
  // interval. A standalone wide gap (for example, between authors) is not a gutter.
  let best:
    | { gutter: number; top: number; bottom: number; support: number }
    | undefined;
  for (let percent = 50; percent <= 66; percent++) {
    const offsets = percent === 50 ? [50] : [100 - percent, percent];
    for (const offset of offsets) {
      const gutter = (offset / 100) * pageWidth;
      const left: PdfLine[] = [];
      const right: PdfLine[] = [];
      for (const line of lines) {
        if (line.right <= gutter) left.push(line);
        else if (line.left >= gutter) right.push(line);
        else if (acrossGutter(line, gutter) > 0) {
          left.push(line);
          right.push(line);
        }
      }
      if (left.length < 2 || right.length < 2) continue;
      const top = Math.max(left[0].y, right[0].y);
      const overlapEnd = Math.min(left.at(-1)!.y, right.at(-1)!.y);
      if (top >= overlapEnd) continue;
      const inBand = (line: PdfLine) =>
        line.y >= top - line.height * 1.5 &&
        line.y <= overlapEnd + line.height * 1.5;
      const leftCount = left.filter(inBand).length;
      const rightCount = right.filter(inBand).length;
      const support = Math.min(leftCount, rightCount);
      if (support >= 2 && support > (best?.support ?? 0)) {
        best = {
          gutter,
          top,
          bottom: Math.max(left.at(-1)!.y, right.at(-1)!.y),
          support,
        };
      }
    }
  }
  return best;
}

export function readPdfLines(runs: PdfTextRun[], pageWidth: number): PdfLine[] {
  const rows: PdfRow[] = [];
  for (const run of runs.sort((a, b) => a.y - b.y || a.x - b.x)) {
    const line = rows.at(-1);
    if (
      line &&
      Math.abs(line.y - run.y) <= Math.min(run.height, line.height) * 0.3
    ) {
      line.runs.push(run);
      line.height = Math.max(line.height, run.height);
    } else {
      rows.push({ y: run.y, height: run.height, runs: [run] });
    }
  }
  const lines = rows.map((row) => {
    row.runs.sort((a, b) => a.x - b.x);
    return toLine(row);
  });
  const columns = findColumns(lines, pageWidth);
  if (!columns) return lines;

  // Read each column top to bottom. Full-width text separates column blocks.
  const result: PdfLine[] = [];
  const left: PdfLine[] = [];
  const right: PdfLine[] = [];
  let column = 0;
  const flush = () => {
    if (!left.length && !right.length) return;
    result.push(
      ...left.map((line) => ({ ...line, column })),
      ...right.map((line) => ({ ...line, column: column + 1 })),
    );
    column += 2;
    left.length = right.length = 0;
  };
  const { gutter, top, bottom } = columns;
  for (const line of lines) {
    const split = acrossGutter(line, gutter);
    if (
      line.y < top - line.height * 1.5 ||
      line.y > bottom + line.height * 1.5
    ) {
      flush();
      result.push(line);
    } else if (split > 0) {
      left.push(toLine(line, line.runs.slice(0, split)));
      right.push(toLine(line, line.runs.slice(split)));
    } else if (line.right <= gutter) {
      left.push(line);
    } else if (line.left >= gutter) {
      right.push(line);
    } else {
      flush();
      result.push(line);
    }
  }
  flush();
  return result;
}

export const abstractHeading =
  /^(?:abstract(?=$|[\s:.—–-])|(?:tóm tắt|résumé)(?=\s*(?:$|[:.—–-])))[ \t]*[:.—–-]?[ \t]*(.*)$/iu;
const followingSection =
  /^(?:(?:\d+(?:\.\d+)*|[ivxlcdm]+)[.)]?\s+(?:introduction|background|materials and methods|methods|results|discussion|conclusions?|tổng quan|giới thiệu|mở đầu|phương pháp|kết quả)|(?:introduction|discussion|references|giới thiệu|mở đầu|tài liệu tham khảo))(?:\s*[:.—–-])?\s*$/iu;
const abstractSubheading =
  /^(?:background|objectives?|aims?|methods|materials and methods|results|conclusions?|tổng quan|mục tiêu|phương pháp|kết quả|kết luận)(?=$|\s*[:.—–-])/iu;
const keywords =
  /^(?:keywords?|index terms|từ khóa|mots-clés)(?=$|[\s:.—–-])/iu;
const authorSeparators = /\s*[;·•]\s*|\s+(?:and|và|&)\s+/iu;
const nameToken = /^\p{Lu}[\p{L}\p{M}.'’-]*$/u;
const nameParticle = /^(?:al|da|de|del|der|di|dos|du|la|le|van|von)$/u;
const affiliationWord =
  /\b(?:academy|center|centre|college|consortium|corporation|department|faculty|foundation|hospital|institute|institution|journal|laboratory|programme|school|university|universit[eé]|universidad)\b|,\s*(?:inc|ltd)\.|(?:trường đại học|viện nghiên cứu|khoa học)/iu;
const authorBoundary =
  /^(?:authors?|tác giả|article information|highlights?|(?:academic |handling |associate )?editors?|reviewers?|communicated by|correspondence|submitted|received|revised|accepted|published|keywords?|copyright|nomenclature|introduction)(?=$|[\s:.—–-])/iu;
const editorialRole =
  /^(?:(?:academic |handling |associate )?editors?|reviewers?|communicated by)(?=$|[\s:])/iu;
const markerOnly = /^[\d\s.,∗*⋆†‡♢§?]+$/u;
const bodyHeading =
  /^(?:(?:\d+(?:\.\d+)*|[ivxlcdm]+)[.)]?\s+)?(?:introduction|nomenclature|materials and methods|methods|results|discussion|references|bibliography|literature cited|giới thiệu|mở đầu|phương pháp|kết quả|tài liệu tham khảo)\s*[:.]?$/iu;
const captionHeading =
  /^(?:(?:(?:supplementary|supplemental|supporting)\s+)?(?:fig(?:ure)?\.?|table|hình|bảng)\s+(?:[a-z]?\d|[ivxlcdm]+\b)|[a-z]\d+\s+(?:fig(?:ure)?|table)\b)/iu;
const nomenclature = /^(?:(?:\d+|[ivxlcdm]+)[.)]\s+)?nomenclature\s*[:.]?$/iu;

export function endsArticleHeader(text: string): boolean {
  return bodyHeading.test(text) || captionHeading.test(text);
}

export type PdfHeaderLine = Pick<
  PdfLine,
  'text' | 'y' | 'height' | 'left' | 'right' | 'column'
>;

function horizontallySeparatedRuns(
  line: PdfLine,
  gap: number,
  separators: readonly number[] = [],
): PdfTextRun[][] {
  const starts = [0];
  for (let index = 1; index < line.runs.length; index++) {
    const previous = line.runs[index - 1];
    const current = line.runs[index];
    const right = previous.x + previous.width;
    if (
      current.x - right >= line.height * gap ||
      (current.x > right &&
        separators.some(
          (position) =>
            position >= right - line.height * 0.12 && position < current.x,
        ))
    )
      starts.push(index);
  }
  return starts.map((start, index) =>
    line.runs.slice(start, starts[index + 1]),
  );
}

function positionedRows(lines: readonly PdfLine[]): PdfLine[] {
  const rows: PdfLine[] = [];
  for (const line of [...lines].sort((a, b) => a.y - b.y || a.left - b.left)) {
    const previous = rows.at(-1);
    if (previous?.y === line.y) {
      const runs = [...previous.runs, ...line.runs].sort((a, b) => a.x - b.x);
      rows[rows.length - 1] = toLine({ y: line.y, height: line.height, runs });
    } else {
      rows.push(line);
    }
  }
  return rows;
}

function spacedAbstractHeading(line: PdfLine): PdfLine | undefined {
  const groups = horizontallySeparatedRuns(line, 1.5);
  for (const runs of groups) {
    const text = joinTextRuns(runs);
    if (
      /^(?:abstract|tómtắt|résumé)$/iu.test(text.replace(/\s+/gu, '')) &&
      (groups.length > 1 || !/^(?:abstract|tóm tắt|résumé)$/iu.test(text))
    )
      return toLine(line, runs);
  }
  return undefined;
}

function abstractLabelLine(row: PdfLine): PdfLine | undefined {
  return (
    spacedAbstractHeading(row) ??
    horizontallySeparatedRuns(row, 1.5)
      .map((runs) => toLine(row, runs))
      .find((line) => abstractHeading.test(line.text))
  );
}

export function readArticleHeader(lines: readonly PdfLine[]): PdfLine[] {
  const rows = positionedRows(lines);
  const boundary = rows.findIndex(
    (line) => abstractLabelLine(line) || endsArticleHeader(line.text),
  );
  return boundary < 0 ? rows : rows.slice(0, boundary);
}

const articleNotes =
  /^(?:©|\*+\s*(?:equal contribution|corresponding)|citation\s*:|funding\s*:|(?:academic |associate )?editors?\s*:|copyright\b|publisher['’]s note|trích dẫn\s*:)/iu;

function endOfAbstract(text: string) {
  return (
    keywords.test(text) ||
    followingSection.test(text) ||
    endsArticleHeader(text) ||
    articleNotes.test(text) ||
    abstractHeading.test(text)
  );
}

function finishAbstract(lines: readonly string[]): string | undefined {
  const value = lines
    .join('\n')
    .replace(
      /(\p{L}[\p{L}-]*)-\n(?=(\p{Ll}[\p{L}-]*))/gu,
      (_match, before: string, after: string) =>
        before.includes('-') || after.includes('-') ? before + '-' : before,
    )
    .replace(/\s+([,.;:!?])/gu, '$1')
    .replace(/\s+/gu, ' ')
    .trim();
  return /[.!?]["'”’)]*$/u.test(value) ? value : undefined;
}

function firstParagraph(rows: readonly PdfLine[], heading: PdfLine) {
  const midpoint = (heading.left + heading.right) / 2;
  for (const row of rows) {
    if (row.y <= heading.y) continue;
    if (row.y - heading.y > heading.height * 3.5) break;
    const parts = horizontallySeparatedRuns(row, 1.4).map((runs) =>
      toLine(row, runs),
    );
    const first = parts.find(
      (part) =>
        part.left <= midpoint &&
        (part.right >= midpoint ||
          Math.abs(part.left - heading.left) <= part.height),
    );
    if (first) return first;
  }
  return undefined;
}

function readAbstractColumn(
  rows: readonly PdfLine[],
  heading: PdfLine,
): string | undefined {
  const lead = abstractHeading.exec(heading.text)?.[1]?.trim();
  const first = lead ? heading : firstParagraph(rows, heading);
  if (!first) return undefined;
  const margin = first.left;
  const paragraphs = lead ? [lead] : [];
  let previous = heading;
  let structured = Boolean(lead && abstractSubheading.test(lead));
  for (const row of rows) {
    if (row.y < first.y || row.y <= heading.y) continue;
    const stops = horizontallySeparatedRuns(row, 1.5).some((runs) => {
      const fragment = toLine(row, runs);
      const newSectionBelow =
        fragment.left < margin &&
        followingSection.test(fragment.text) &&
        row.y - previous.y > previous.height * 2 &&
        /[.!?]["'”’)]*$/u.test(paragraphs.at(-1) ?? '');
      return (
        newSectionBelow ||
        (Math.abs(fragment.left - margin) <= first.height * 2.1 &&
          (endOfAbstract(fragment.text) || abstractLabelLine(fragment)) &&
          !abstractSubheading.test(fragment.text))
      );
    });
    if (stops) break;
    // PDF text items from parallel regions can share a baseline. Read the
    // horizontal band established by the first line of abstract prose.
    const runs = row.runs.filter(({ x }) => x >= margin - first.height * 0.8);
    if (!runs.length) continue;
    const part = horizontallySeparatedRuns(toLine(row, runs), 1.5)[0];
    const line = toLine(row, part);
    if (line.left > margin + first.height * 1.8) continue;
    const subheading = abstractSubheading.test(line.text);
    if (endOfAbstract(line.text) && !subheading) break;
    if (part.every(({ text }) => markerOnly.test(text))) continue;
    const gap = line.y - previous.y;
    if (paragraphs.length && gap > previous.height * 3.5) {
      // A layout break without a section label is ambiguous. A following
      // publication note still provides an explicit end of the abstract.
      return undefined;
    }
    if (
      subheading &&
      !structured &&
      !/[:.—–-]/u.test(line.text) &&
      paragraphs.length &&
      line.height >= previous.height * 1.2 &&
      gap >= previous.height * 1.8
    ) {
      break;
    }
    // Superscript reference numbers are usually emitted in their own row.
    if (line.height < first.height * 0.72 && line.text.length < 4) continue;
    structured ||= subheading;
    paragraphs.push(line.text);
    previous = line;
  }
  return finishAbstract(paragraphs);
}

export function readAbstract(pages: readonly PdfLine[][]): string | undefined {
  for (const page of pages) {
    const rows = positionedRows(page);
    const heading = rows
      .map(abstractLabelLine)
      .find((line) => line !== undefined);
    if (heading) {
      return readAbstractColumn(rows, heading);
    }
    if (rows.some(({ text }) => endsArticleHeader(text))) break;
  }
  return undefined;
}

export function readHeadinglessAbstract(
  lines: readonly PdfLine[],
): string | undefined {
  const page = positionedRows(lines);
  const boundary = page.findIndex(({ text }) => nomenclature.test(text));
  if (
    boundary < 3 ||
    page.slice(0, boundary).some(({ text }) => endsArticleHeader(text))
  )
    return undefined;

  let start = boundary - 1;
  const last = page[start];
  if (page[boundary].y - last.y < last.height * 1.5) return undefined;
  while (start > 0) {
    const above = page[start - 1];
    const current = page[start];
    if (
      !adjacentBelow(above, current, 3.25) ||
      Math.abs(above.left - last.left) > last.height * 1.65 ||
      Math.abs(above.height - last.height) > last.height * 0.2 ||
      authorBoundary.test(above.text) ||
      articleNotes.test(above.text)
    )
      break;
    start--;
  }
  const value = finishAbstract(
    page.slice(start, boundary).map(({ text }) => text),
  );
  return boundary - start >= 3 && (value?.split(' ').length ?? 0) >= 35
    ? value
    : undefined;
}

export function readAuthorNames(value: unknown): string[] | undefined {
  // A comma in an unstructured field can be the separator in "Family, Given".
  if (Array.isArray(value)) {
    const names = value.map(displayName);
    return names.length &&
      names.length <= 100 &&
      names.every((name) => name !== undefined)
      ? names
      : undefined;
  }
  if (typeof value !== 'string') return undefined;
  const names = authorList(value);
  if (names.length > 1) return readAuthorNames(names);
  if (value.includes(',') || authorSeparators.test(value)) return undefined;
  const name = displayName(value);
  return name ? [name] : undefined;
}

function displayName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const name = value.replace(/\s+/gu, ' ').trim();
  return name && name.length <= 255 ? name : undefined;
}

export function personName(value: string): boolean {
  const words = value.trim().split(/\s+/u);
  return (
    words.length >= 2 &&
    words.length <= 6 &&
    nameToken.test(words[0]) &&
    nameToken.test(words.at(-1)!) &&
    words.every((word) => nameToken.test(word) || nameParticle.test(word)) &&
    !affiliationWord.test(value)
  );
}

function authorList(value: string): string[] {
  const parts = value.trim().split(authorSeparators);
  const names = parts.flatMap((part) => part.split(/\s*,\s*/u).filter(Boolean));
  return names.length > 1 && names.every(personName) ? names : [value];
}

export function readLabeledAuthors(value: string | undefined) {
  // The label identifies the role. Preserve organizations and inverted names
  // as written when the comma does not clearly delimit two full names.
  return value ? readAuthorNames(authorList(value)) : undefined;
}

export function composeNameDiacritics(value: string): string {
  // Some PDF fonts emit a spacing accent between the surrounding letters.
  return value
    .replace(
      /(\p{L})\s*([˘¸])\s*([gGsSçcCtT])/gu,
      (original, before: string, mark: string, letter: string) => {
        if (mark === '˘' && !/[gG]/u.test(letter)) return original;
        return before + letter + (mark === '˘' ? '\u0306' : '\u0327');
      },
    )
    .normalize('NFC');
}

function cleanByline(value: string): string {
  return composeNameDiacritics(
    value
      .replace(/[∗*⋆†‡♢§]/gu, '')
      .replace(
        /,\s*\((?:(?:life|senior|student)\s+)?(?:member|fellow),?\s+[^()]+\)\s*$/iu,
        '',
      )
      .replace(/^[\s,;&·•]+|[\s,;&·•]+$/gu, '')
      .replace(/^(?:and|và)(?:\s+|$)/iu, ''),
  ).trim();
}

function readByline(
  line: PdfLine,
  markers: readonly PdfLine[],
): { authorNames?: string[]; separated?: boolean } | undefined {
  // A superscript belongs to the author immediately before it. Its position
  // can separate names even when their horizontal gap alone is too small.
  const separators = markers
    .filter(
      (marker) => marker.y < line.y && line.y - marker.y <= line.height * 0.7,
    )
    .flatMap(({ runs }) => runs.map(({ x }) => x));
  const groups = horizontallySeparatedRuns(line, 1, separators)
    .map(joinTextRuns)
    .filter((value) => !value.includes('@') && !markerOnly.test(value))
    .map(cleanByline)
    .filter(Boolean);
  const names = groups.flatMap(authorList);
  if (names.length && names.every(personName))
    return {
      authorNames: readAuthorNames(names),
      separated: groups.length > 1,
    };
  const inverted = cleanByline(line.text)
    .split(',')
    .map((part) => part.trim());
  // This looks like a byline, but there is no reliable way to split its author list.
  if (inverted.length === 2 && inverted.every((part) => nameToken.test(part))) {
    return {};
  }
  return undefined;
}

function adjacentBelow(
  above: PdfHeaderLine,
  below: PdfHeaderLine,
  maxGap = 1.8,
) {
  return (
    below.y > above.y &&
    below.y - above.y <= above.height * maxGap &&
    below.left <= above.right &&
    above.left <= below.right
  );
}

function continuesTitle(above: PdfHeaderLine, below: PdfHeaderLine) {
  return (
    Math.abs(above.height - below.height) <= below.height * 0.07 &&
    adjacentBelow(above, below)
  );
}

export function matchesArticleHeading(
  title: string,
  header: readonly PdfHeaderLine[],
): boolean {
  if (!articleTitle(title)) return false;
  const normalized = comparableArticleText(title);
  const lines = header
    .filter(({ text }) => !markerOnly.test(text))
    .sort((a, b) => a.y - b.y || a.left - b.left);
  for (const [index, first] of lines.entries()) {
    if (!articleTitle(first.text) || authorBoundary.test(first.text)) continue;
    const label = /^(?:title|tiêu đề)\s*:\s*(.+)$/iu.exec(first.text);
    if (label && comparableArticleText(label[1]) === normalized) return true;
    const parts: string[] = [];
    for (let end = index; end < Math.min(lines.length, index + 4); end++) {
      const line = lines[end];
      if (end > index && !continuesTitle(lines[end - 1], line)) break;
      parts.push(line.text);
      const printed = comparableArticleText(parts.join(' '));
      if (printed === normalized) {
        const next = lines[end + 1];
        // A matching phrase in running text provides no heading evidence.
        if (
          next &&
          adjacentBelow(line, next, 5) &&
          first.height >= next.height * 1.08 &&
          (personName(next.text) ||
            authorList(next.text).every(personName) ||
            undelimitedByline(next))
        )
          return true;
        break;
      }
      if (!normalized.startsWith(printed + ' ')) break;
    }
  }
  return false;
}

export type FrontMatter = {
  title?: string;
  authorNames?: string[];
  firstByline?: string[];
  bylineUnresolved?: boolean;
  undelimitedByline?: string;
};

function undelimitedByline(line: PdfHeaderLine) {
  const text = cleanByline(line.text);
  const words = text.split(/\s+/u);
  return words.length >= 4 &&
    !affiliationWord.test(text) &&
    words.every((word) => nameToken.test(word) || nameParticle.test(word))
    ? text
    : undefined;
}

function hasAuthorMarker(line: PdfLine, markers: readonly PdfLine[]) {
  return markers.some(
    (marker) =>
      marker.y < line.y &&
      line.y - marker.y <= line.height * 0.7 &&
      marker.left >= line.left &&
      marker.left <= line.right + line.height,
  );
}

function namesUnderTitle(
  rows: readonly PdfLine[],
  markers: readonly PdfLine[],
  hasAbstract: boolean,
): FrontMatter {
  const first = rows[0];
  const lead = first && readByline(first, markers);
  if (!lead?.authorNames) return { bylineUnresolved: true };

  const authorNames = [...lead.authorNames];
  const firstMarked = hasAuthorMarker(first, markers);
  let markedRows = Number(firstMarked);
  let previous = first;
  let previousGap: number | undefined;
  let grid = lead.separated;
  let crossedAffiliation = false;
  for (let index = 1; index < rows.length; index++) {
    const row = rows[index];
    if (authorBoundary.test(row.text)) break;
    if (row.text === 'and' || row.text === 'và') continue;
    if (
      markers.some(
        (marker) =>
          marker.y < row.y &&
          row.y - marker.y <= row.height * 0.7 &&
          marker.right <= row.left + 0.5 &&
          row.left - marker.right <= row.height * 0.6,
      )
    ) {
      crossedAffiliation = true;
      continue;
    }
    const marked = hasAuthorMarker(row, markers);
    const candidate = readByline(row, markers);
    const names = candidate?.authorNames;
    const gap = row.y - previous.y;
    if (names && marked) {
      authorNames.push(...names);
      markedRows++;
      grid ||= candidate?.separated === true;
      previousGap = gap;
      previous = row;
      continue;
    }
    const nearby = adjacentBelow(previous, row, 1.75);
    const sameStyle = Math.abs(row.height - first.height) <= first.height * 0.2;
    const repeatedRow =
      previousGap !== undefined &&
      Math.abs(gap - previousGap) <= previous.height * 0.35 &&
      adjacentBelow(previous, row, 3);
    if (
      names &&
      sameStyle &&
      !crossedAffiliation &&
      ((!lead.separated && nearby) ||
        (candidate?.separated && names.length > 1 && repeatedRow) ||
        (nearby && /^(?:and|và)\s/iu.test(row.text)))
    ) {
      authorNames.push(...names);
      previousGap = gap;
      previous = row;
      continue;
    }
    if (row.text.includes('@') || affiliationWord.test(row.text)) {
      crossedAffiliation = true;
      continue;
    }
    if (
      nearby &&
      !crossedAffiliation &&
      /^(?:,|and\s|và\s)|[,;]$/iu.test(row.text)
    )
      return { firstByline: authorNames, bylineUnresolved: true };
    if (grid && repeatedRow && sameStyle && !crossedAffiliation)
      return { firstByline: authorNames, bylineUnresolved: true };
    if (nearby && (lead.separated || (firstMarked && markedRows >= 1))) {
      crossedAffiliation = true;
      continue;
    }
    // A later author/contact row can expose a break inside the byline,
    // such as an address between contributors. The prefix is then unsafe.
    for (const following of rows.slice(index + 1)) {
      if (authorBoundary.test(following.text)) break;
      if (
        (following.text.includes('@') || hasAuthorMarker(following, markers)) &&
        readByline(following, markers)?.authorNames
      )
        return { firstByline: authorNames, bylineUnresolved: true };
    }
    break;
  }

  if (!hasAbstract && markedRows < 2)
    return { firstByline: authorNames, bylineUnresolved: true };
  // A trailing separator can be the only surviving evidence of another row
  // in a damaged text layer. Keep the field empty if that row is unreadable.
  if (/[,;]\s*$/u.test(previous.text))
    return { firstByline: authorNames, bylineUnresolved: true };
  return { authorNames };
}

function excludeEditorialSidebar(rows: readonly PdfLine[], title: PdfLine) {
  const separated = rows.flatMap((line) =>
    horizontallySeparatedRuns(line, 1.5).map((runs) => toLine(line, runs)),
  );
  const sidebars = separated.filter(
    (line) =>
      editorialRole.test(line.text) &&
      (line.right < title.left || line.left > title.right),
  );
  if (!sidebars.length) return rows;
  return rows.flatMap((line) => {
    const runs = line.runs.filter(
      (run) =>
        !sidebars.some(
          (side) =>
            Math.abs(run.y - side.y) <= side.height * 5 &&
            (side.right < title.left
              ? run.x < title.left
              : run.x > title.right),
        ),
    );
    return runs.length ? [toLine(line, runs)] : [];
  });
}

export function readFrontMatter(firstPage: readonly PdfLine[]): FrontMatter {
  const rows = positionedRows(firstPage);
  const markers = rows.filter(({ text }) => markerOnly.test(text));
  const content = rows.filter(({ text }) => !markerOnly.test(text));
  const abstractStart = content.findIndex(abstractLabelLine);
  const bodyStart = content.findIndex(({ text }) => endsArticleHeader(text));
  const boundary = Math.min(
    abstractStart < 0 ? content.length : abstractStart,
    bodyStart < 0 ? content.length : bodyStart,
  );
  const hasAbstract = boundary === abstractStart;
  const front = content.slice(0, boundary);
  const candidates: Array<{ height: number; identity: FrontMatter }> = [];
  for (let start = 0; start < front.length; start++) {
    const first = front[start];
    if (
      !articleTitle(first.text) ||
      authorBoundary.test(first.text) ||
      (hasAuthorMarker(first, markers) &&
        readByline(first, markers)?.authorNames)
    )
      continue;
    let end = start;
    while (front[end + 1] && continuesTitle(front[end], front[end + 1])) {
      const following = front[end + 1];
      if (
        authorBoundary.test(following.text) ||
        (hasAuthorMarker(following, markers) &&
          readByline(following, markers)?.authorNames)
      )
        break;
      end++;
    }
    const afterTitle = excludeEditorialSidebar(front.slice(end + 1), first);
    const next = afterTitle[0] ?? content[boundary];
    const markedByline = next && hasAuthorMarker(next, markers);
    if (
      !next ||
      !adjacentBelow(front[end], next, 5) ||
      (!markedByline && first.height < next.height * 1.08)
    ) {
      start = end;
      continue;
    }
    const title = front
      .slice(start, end + 1)
      .map(({ text }) => text)
      .join(' ');
    if (title.split(/\s+/u).length >= 2 && articleTitle(title)) {
      const lead = readByline(next, markers);
      const undelimited = lead ? undefined : undelimitedByline(next);
      const affiliation = afterTitle[1];
      const corroborated =
        hasAbstract ||
        (affiliation &&
          adjacentBelow(next, affiliation) &&
          (affiliationWord.test(affiliation.text) ||
            hasAuthorMarker(next, markers)));
      if (
        (next === content[abstractStart] &&
          first.height >= next.height * 1.25) ||
        ((lead || undelimited) && corroborated)
      ) {
        candidates.push({
          height: first.height,
          identity: {
            title,
            ...(lead && namesUnderTitle(afterTitle, markers, hasAbstract)),
            ...(undelimited && {
              undelimitedByline: undelimited,
              bylineUnresolved: true,
            }),
          },
        });
      }
    }
    start = end;
  }
  candidates.sort((a, b) => b.height - a.height);
  const [best, other] = candidates;
  return best && (!other || best.height > other.height * 1.1)
    ? best.identity
    : {};
}
import { articleTitle, comparableArticleText } from './article-pdf-identity.js';
