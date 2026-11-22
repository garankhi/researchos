import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import ExcelJS from 'exceljs';
import type { LlkhFormat } from '@researchos/queue';
import {
  classifyOutput,
  publicationGroups,
  type PublicationEvidence,
} from './output-classifier.js';

type Cell = string | number;
type Section = { title: string; rows: Cell[][] };
export type LlkhData = {
  profile: Cell[][];
  academic: Cell[][];
  outputs: (PublicationEvidence & { cells: Cell[] })[];
};

const columnNames = [
  'STT',
  'Tên công trình',
  'Tác giả',
  'Năm',
  'Nơi công bố',
  'Loại hình',
  'Trạng thái',
  'DOI / URL',
];
const heading = 'LÝ LỊCH KHOA HỌC';
const banner = [
  'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',
  'Độc lập - Tự do - Hạnh phúc',
];

function sections(data: LlkhData, formatted: boolean): Section[] {
  const profile = {
    title: formatted ? 'I. Thông tin cá nhân' : 'Thông tin cá nhân',
    rows: data.profile,
  };
  const rows = data.outputs.map((output, index) => [
    index + 1,
    ...output.cells,
  ]);
  if (!formatted)
    return [
      profile,
      { title: 'Công trình khoa học', rows: [columnNames, ...rows] },
    ];

  const groups = new Map<keyof typeof publicationGroups, Cell[][]>();
  data.outputs.forEach((output, index) => {
    const group = classifyOutput(output);
    const groupedRows = groups.get(group) ?? [];
    groupedRows.push(rows[index]);
    groups.set(group, groupedRows);
  });
  return [
    profile,
    { title: 'II. Công tác và nghiên cứu', rows: data.academic },
    { title: 'III. Danh mục công trình khoa học', rows: [] },
    ...Object.entries(publicationGroups).map(([key, title], index) => ({
      title: `III.${index + 1}. ${title}`,
      rows: [
        columnNames,
        ...(groups.get(key as keyof typeof publicationGroups) ?? []),
      ],
    })),
  ];
}

function paragraph(value: Cell, bold = false, centered = false) {
  return new Paragraph({
    alignment: centered ? AlignmentType.CENTER : AlignmentType.LEFT,
    children: [new TextRun({ text: String(value), bold })],
  });
}

export async function renderLlkh(
  data: LlkhData,
  format: LlkhFormat,
  formatted: boolean,
): Promise<Uint8Array> {
  const content = sections(data, formatted);
  const headings = formatted ? [...banner, heading] : [heading];
  if (format === 'docx') {
    const document = new Document({
      styles: {
        default: { document: { run: { font: 'Times New Roman', size: 24 } } },
      },
      sections: [
        {
          properties: {
            page: {
              margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 },
            },
          },
          children: [
            ...headings.map((title) => paragraph(title, true, true)),
            ...content.flatMap(({ title, rows }) => [
              paragraph(title, true),
              ...(rows.length
                ? [
                    new Table({
                      width: { size: 100, type: WidthType.PERCENTAGE },
                      rows: rows.map(
                        (row) =>
                          new TableRow({
                            tableHeader: row === columnNames,
                            children: row.map(
                              (value) =>
                                new TableCell({
                                  children: [
                                    paragraph(value, row === columnNames),
                                  ],
                                }),
                            ),
                          }),
                      ),
                    }),
                  ]
                : []),
            ]),
          ],
        },
      ],
    });
    return Packer.toBuffer(document);
  }
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('LLKH', {
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  [24, 45, 32, 10, 30, 21, 12, 38].forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  for (const title of headings) {
    const row = sheet.addRow([title]);
    sheet.mergeCells(row.number, 1, row.number, columnNames.length);
    row.font = { bold: true };
    row.alignment = { horizontal: 'center' };
  }
  for (const section of content) {
    sheet.addRow([]);
    sheet.addRow([section.title]).font = { bold: true };
    for (const values of section.rows) {
      const row = sheet.addRow(values);
      row.alignment = { wrapText: true, vertical: 'top' };
      if (values === columnNames) row.font = { bold: true };
    }
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
