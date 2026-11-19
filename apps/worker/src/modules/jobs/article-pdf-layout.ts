export interface PdfTextRun {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
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

function toLine(row: PdfRow, runs = row.runs): PdfLine {
  return {
    ...row,
    runs,
    height: Math.max(...runs.map(({ height }) => height)),
    text: runs.map((run) => run.text).join(' '),
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
  /^(?:abstract|tóm tắt)(?=$|[\s:—–-])[ \t]*[:—–-]?[ \t]*(.*)$/iu;
const followingSection =
  /^(?:(?:\d+(?:\.\d+)*|[ivxlcdm]+)[.)]?\s+(?:introduction|background|materials and methods|methods|results|discussion|conclusions?|tổng quan|giới thiệu|mở đầu|phương pháp|kết quả)|(?:introduction|discussion|references|giới thiệu|mở đầu|tài liệu tham khảo))(?:\s*[:.—–-])?\s*$/iu;
const abstractSubheading =
  /^(?:background|objectives?|aims?|methods|materials and methods|results|conclusions?|tổng quan|mục tiêu|phương pháp|kết quả|kết luận)(?=$|\s*[:.—–-])/iu;
const keywords = /^(?:keywords?|index terms|từ khóa)(?:$|\s*[:.—–-])/iu;
const authorSeparators = /\s*;\s*|\s+(?:and|và|&)\s+/iu;
const nameToken = /^\p{Lu}[\p{L}\p{M}.'’-]*$/u;
const nameParticle = /^(?:al|da|de|del|der|di|dos|du|la|le|van|von)$/u;
const affiliationWord =
  /\b(?:academy|center|centre|college|consortium|department|faculty|foundation|hospital|institute|institution|journal|laboratory|programme|school|university|universit[eé]|universidad)\b|(?:trường đại học|viện nghiên cứu|khoa học)/iu;
const masthead =
  /^(?:(?:the\s+)?journal\s+of\b|(?:(?:e-?)?issn|vol(?:ume)?)[\s.:])/iu;

export function readAbstract(pages: readonly PdfLine[][]): string | undefined {
  let paragraphs: string[] | undefined;
  let structured = false;
  pages: for (const page of pages) {
    let start = 0;
    let column: number | undefined;
    if (!paragraphs) {
      const heading = page.findIndex(({ text }) => abstractHeading.test(text));
      if (heading < 0) continue;
      paragraphs = [abstractHeading.exec(page[heading].text)?.[1] ?? ''];
      column = page[heading].column;
      start = heading + 1;
    }
    for (let index = start; index < page.length; index++) {
      const line = page[index];
      if (
        (column !== undefined && column !== line.column) ||
        keywords.test(line.text) ||
        followingSection.test(line.text)
      ) {
        break pages;
      }
      column ??= line.column;
      const previous = page[index - 1];
      const subheading = abstractSubheading.test(line.text);
      // A styled, standalone section after prose can also end an abstract without
      // numbering. Inline structured labels such as "Methods:" stay with the prose.
      if (
        subheading &&
        !structured &&
        !/[:.—–-]/u.test(line.text) &&
        previous &&
        (paragraphs.length > 1 || paragraphs[0]) &&
        line.height >= previous.height * 1.2 &&
        line.y - previous.y >= previous.height * 1.8
      ) {
        break pages;
      }
      structured ||= subheading;
      paragraphs.push(line.text);
    }
    if (column !== undefined) break;
  }
  return paragraphs?.join(' ').trim() || undefined;
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
  if (value.includes(';')) return readAuthorNames(value.split(';'));
  if (value.includes(',') || authorSeparators.test(value)) return undefined;
  const name = displayName(value);
  return name ? [name] : undefined;
}

function displayName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const name = value.replace(/\s+/gu, ' ').trim();
  return name && name.length <= 255 ? name : undefined;
}

function personName(value: string): boolean {
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
  return value.split(';').flatMap((part) => {
    const names = part
      .split(/,|\s+(?:and|và|&)\s+/iu)
      .map((name) => name.trim());
    return names.length > 1 && names.every(personName) ? names : [part];
  });
}

export function readLabeledAuthors(value: string | undefined) {
  // The label identifies the role. Preserve organizations and inverted names
  // as written when the comma does not clearly delimit two full names.
  return value ? readAuthorNames(authorList(value)) : undefined;
}

function readByline(line: PdfLine): { authorNames?: string[] } | undefined {
  const spaced = line.runs.every(
    (run, index, runs) =>
      index === 0 ||
      run.x - (runs[index - 1].x + runs[index - 1].width) > line.height,
  );
  const names =
    spaced && line.runs.length > 1
      ? line.runs.map(({ text }) => text)
      : authorList(line.text);
  if (names.every(personName)) return { authorNames: readAuthorNames(names) };
  const inverted = line.text.split(',').map((part) => part.trim());
  // This looks like a byline, but there is no reliable way to split its author list.
  if (inverted.length === 2 && inverted.every((part) => nameToken.test(part))) {
    return {};
  }
  return undefined;
}

function adjacentBelow(above: PdfLine, below: PdfLine) {
  return (
    below.y > above.y &&
    below.y - above.y <= above.height * 1.8 &&
    below.left <= above.right &&
    above.left <= below.right
  );
}

type FrontMatter = { title?: string; authorNames?: string[] };

export function readFrontMatter(firstPage: readonly PdfLine[]): FrontMatter {
  const abstractStart = firstPage.findIndex(({ text }) =>
    abstractHeading.test(text),
  );
  if (abstractStart < 1) return {};
  const frontLines = firstPage.slice(0, abstractStart);
  const bodyHeight = firstPage[abstractStart].height;
  const groups: Array<{ start: number; end: number }> = [];
  for (const [index, line] of frontLines.entries()) {
    if (line.height < bodyHeight * 1.25) continue;
    const group = groups.at(-1);
    const above = frontLines[index - 1];
    if (
      group?.end === index - 1 &&
      Math.abs(above.height - line.height) <= line.height * 0.15 &&
      adjacentBelow(above, line)
    ) {
      group.end = index;
    } else {
      groups.push({ start: index, end: index });
    }
  }

  const candidates: FrontMatter[] = [];
  for (const { start, end } of groups) {
    const titleLines = frontLines.slice(start, end + 1);
    const last = frontLines[end];
    const next = firstPage[end + 1];
    if (!adjacentBelow(last, next)) continue;
    const title = titleLines.map(({ text }) => text).join(' ');
    if (masthead.test(title)) continue;
    if (end + 1 === abstractStart) {
      candidates.push({ title });
    } else if (next.height < last.height) {
      const byline = readByline(next);
      if (byline) candidates.push({ title, ...byline });
    }
  }
  return candidates.length === 1 ? candidates[0] : {};
}
