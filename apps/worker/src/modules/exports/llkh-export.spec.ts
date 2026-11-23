import { describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import {
  classifyOutput,
  type PublicationEvidence,
} from './output-classifier.js';
import { renderWithFallback } from './llkh-export.handler.js';
import { renderLlkh, type LlkhData } from './llkh-template.js';

const article: PublicationEvidence = {
  type: 'ARTICLE',
  venue: 'Research journal',
  publisher: null,
  peerReviewed: false,
  doi: null,
  sources: [],
};

const data: LlkhData = {
  profile: [['Họ và tên', 'Nguyễn Văn An']],
  academic: [['Hướng nghiên cứu', 'Phần mềm']],
  outputs: [
    {
      ...article,
      title: 'Tổng hợp phương pháp nhận diện cảm xúc từ dữ liệu đa phương thức',
      authors: 'Nguyễn Văn An, Trần Thị Bích',
      date: '2026-01',
      status: 'DRAFT',
      doi: '10.1234/example',
      url: null,
    },
  ],
};

describe('LLKH export', () => {
  it('keeps publication metadata readable and the DOI clickable in Excel', async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await renderLlkh(data, 'xlsx', true));
    const sheet = workbook.getWorksheet('LLKH')!;
    const rows: ExcelJS.Row[] = [];
    sheet.eachRow((row) => {
      rows.push(row);
    });
    const title = rows.find(
      (row) => row.getCell(1).text === data.outputs[0].title,
    )!;
    const authors = rows.find((row) =>
      row.getCell(1).text.includes('Trần Thị Bích'),
    )!;
    const doi = rows.find((row) => row.getCell(1).text.startsWith('DOI:'))!;
    expect(title.font).toMatchObject({ name: 'Arial', bold: true });
    expect(authors.alignment.wrapText).toBe(true);
    expect(doi.getCell(1).hyperlink).toBe('https://doi.org/10.1234/example');
  });

  it.each([
    [{ sources: ['SCOPUS'] }, 'indexed'],
    [{ sources: ['WOS'] }, 'indexed'],
    [{ doi: '10.1109/test' }, 'other'],
    [{ doi: '10.1109/test', peerReviewed: true }, 'international'],
    [
      {
        venue: 'Tạp chí Khoa học Việt Nam',
        peerReviewed: true,
        doi: '10.1234/test',
      },
      'domestic',
    ],
    [{ type: 'CONFERENCE_PAPER', sources: ['SCOPUS'] }, 'conference'],
    [{ venue: 'Symposium on research' }, 'conference'],
    [{ type: 'BOOK_CHAPTER' }, 'books'],
  ] satisfies [Partial<PublicationEvidence>, string][])(
    'classifies %j as %s',
    (input, group) => {
      expect(classifyOutput({ ...article, ...input })).toBe(group);
    },
  );

  it.each(['docx', 'xlsx'] as const)(
    'renders %s at both levels',
    async (format) => {
      expect((await renderWithFallback(data, format)).exportLevel).toBe(2);
      const render = vi
        .fn<typeof renderLlkh>()
        .mockRejectedValueOnce(new Error('Template failed'))
        .mockImplementationOnce(renderLlkh);
      const result = await renderWithFallback(data, format, render);
      expect(render).toHaveBeenNthCalledWith(2, data, format, false);
      expect(result.exportLevel).toBe(1);
      expect(Array.from(result.buffer.slice(0, 4))).toEqual([80, 75, 3, 4]);
    },
  );
});
