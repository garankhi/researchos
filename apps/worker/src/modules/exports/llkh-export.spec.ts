import { describe, expect, it, vi } from 'vitest';
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
      cells: [
        'Test article',
        'Nguyễn Văn An',
        2026,
        'Journal',
        'ARTICLE',
        'DRAFT',
        '',
      ],
    },
  ],
};

describe('LLKH export', () => {
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
