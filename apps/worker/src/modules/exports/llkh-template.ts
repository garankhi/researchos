import { Document, ExternalHyperlink, Packer, Paragraph, TextRun } from 'docx';
import ExcelJS from 'exceljs';
import { normalizeArticleDoi } from '@researchos/publication-metadata';
import type { LlkhFormat } from '@researchos/queue';
import {
  classifyOutput,
  publicationGroups,
  type PublicationEvidence,
} from './output-classifier.js';

type Publication = PublicationEvidence & {
  title: string;
  authors: string;
  date: string;
  status: string;
  url: string | null;
};

export type LlkhData = {
  profile: [string, string][];
  academic: [string, string][];
  outputs: Publication[];
};

type Line = {
  text: string;
  kind: 'title' | 'section' | 'work' | 'body';
  link?: string;
};

const font = 'Arial';
const appearances = {
  title: { size: 22, bold: true, color: '173653', fill: 'FFFFFF' },
  section: { size: 12, bold: true, color: '173653', fill: 'E4EEF7' },
  work: { size: 12, bold: true, color: '202B38', fill: 'F4F7FA' },
  body: { size: 11, bold: false, color: '202B38', fill: 'FFFFFF' },
};
const outputTypes: Record<string, string> = {
  ARTICLE: 'Bài báo',
  CONFERENCE_PAPER: 'Bài hội nghị',
  BOOK: 'Sách',
  BOOK_CHAPTER: 'Chương sách',
  PREPRINT: 'Bản thảo công bố trước',
};

function webUrl(value: string | null): string | undefined {
  if (!value) return undefined;
  const url = URL.parse(value);
  return url && (url.protocol === 'http:' || url.protocol === 'https:')
    ? url.href
    : undefined;
}

function publicationBlock(output: Publication, number: number): Line[] {
  const doi = normalizeArticleDoi(output.doi);
  const metadata = [
    output.date,
    outputTypes[output.type] ?? output.type,
    output.status === 'DRAFT' ? 'Bản nháp' : 'Đã chia sẻ',
  ].filter(Boolean);
  const lines: Line[] = [{ kind: 'work', text: `${number}. ${output.title}` }];
  const venue = output.venue || output.publisher;
  if (venue) lines.push({ kind: 'body', text: venue });
  lines.push({ kind: 'body', text: metadata.join('  |  ') });
  if (output.doi) {
    lines.push({
      kind: 'body',
      text: `DOI: ${output.doi}`,
      link: doi
        ? `https://doi.org/${encodeURIComponent(doi).replace('%2F', '/')}`
        : undefined,
    });
  }
  if (output.url) {
    lines.push({
      kind: 'body',
      text: `Liên kết: ${output.url}`,
      link: webUrl(output.url),
    });
  }
  if (output.authors)
    lines.push({ kind: 'body', text: `Tác giả: ${output.authors}` });
  return lines;
}

function profileBlock(title: string, entries: [string, string][]): Line[] {
  return [
    { kind: 'section', text: title },
    ...entries
      .filter(([, value]) => value.trim())
      .map(([label, value]): Line => ({
        kind: 'body',
        text: `${label}: ${value}`,
      })),
  ];
}

function buildBlocks(data: LlkhData, formatted: boolean): Line[][] {
  const blocks: Line[][] = [
    [{ kind: 'title', text: 'Lý lịch khoa học' }],
    profileBlock('Thông tin cá nhân', data.profile),
  ];
  if (data.academic.some(([, value]) => value.trim())) {
    blocks.push(profileBlock('Công tác và nghiên cứu', data.academic));
  }

  if (!formatted || data.outputs.length === 0) {
    blocks.push([{ kind: 'section', text: 'Công trình khoa học' }]);
    return [
      ...blocks,
      ...(data.outputs.length
        ? data.outputs.map((output, index) =>
            publicationBlock(output, index + 1),
          )
        : [[{ kind: 'body' as const, text: 'Chưa có công trình khoa học.' }]]),
    ];
  }

  const groups = new Map<keyof typeof publicationGroups, Publication[]>();
  for (const output of data.outputs) {
    const group = classifyOutput(output);
    const publications = groups.get(group);
    if (publications) publications.push(output);
    else groups.set(group, [output]);
  }
  let nextNumber = 1;
  for (const group of Object.keys(
    publicationGroups,
  ) as (keyof typeof publicationGroups)[]) {
    const publications = groups.get(group);
    if (!publications?.length) continue;
    blocks.push(
      [{ kind: 'section', text: publicationGroups[group] }],
      ...publications.map((output, index) =>
        publicationBlock(output, nextNumber + index),
      ),
    );
    nextNumber += publications.length;
  }
  return blocks;
}

function wordParagraph(
  line: Line,
  position: number,
  blockLength: number,
): Paragraph {
  const style = appearances[line.kind];
  const size = style.size * 2;
  const runs = line.text.split(/\r\n?|\n/).map(
    (text, index) =>
      new TextRun({
        text,
        break: index ? 1 : undefined,
        font: { ascii: font, hAnsi: font, eastAsia: font, cs: font },
        size,
        sizeComplexScript: size,
        bold: style.bold,
        color: line.link ? '0B6086' : style.color,
        underline: line.link ? {} : undefined,
      }),
  );
  return new Paragraph({
    children: line.link
      ? [new ExternalHyperlink({ link: line.link, children: runs })]
      : runs,
    shading: { fill: style.fill },
    keepNext: position < blockLength - 1 || line.kind === 'section',
    keepLines: line.kind !== 'body',
    spacing: {
      before: position === 0 ? 170 : 0,
      after: position === blockLength - 1 ? 90 : 45,
      line: 288,
    },
  });
}

export async function renderLlkh(
  data: LlkhData,
  format: LlkhFormat,
  formatted: boolean,
): Promise<Uint8Array> {
  const blocks = buildBlocks(data, formatted);
  if (format === 'docx') {
    const document = new Document({
      styles: {
        default: {
          document: { run: { font, size: 22, language: { value: 'vi-VN' } } },
        },
      },
      sections: [
        {
          properties: {
            page: {
              size: { width: 11906, height: 16838 },
              margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 },
            },
          },
          children: blocks.flatMap((block) =>
            block.map((line, position) =>
              wordParagraph(line, position, block.length),
            ),
          ),
        },
      ],
    });
    return Packer.toBuffer(document);
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('LLKH', {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  sheet.getColumn(1).width = 108;
  for (const [index, block] of blocks.entries()) {
    if (index) sheet.addRow([]).height = 8;
    for (const line of block) {
      const style = appearances[line.kind];
      const row = sheet.addRow([
        line.link ? { text: line.text, hyperlink: line.link } : line.text,
      ]);
      row.font = {
        name: font,
        size: style.size,
        bold: style.bold,
        color: { argb: `FF${line.link ? '0B6086' : style.color}` },
        underline: Boolean(line.link),
      };
      row.alignment = { wrapText: true, vertical: 'middle', indent: 1 };
      row.getCell(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: `FF${style.fill}` },
      };
      // Excel readers differ in whether they recalculate wrapped row heights on open.
      const lines = line.text
        .split(/\r?\n/)
        .reduce(
          (count, text) => count + Math.max(1, Math.ceil(text.length / 82)),
          0,
        );
      row.height = Math.min(409, lines * (style.size + 5) + 7);
    }
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
