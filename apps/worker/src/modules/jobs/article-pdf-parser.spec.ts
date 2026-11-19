import { describe, expect, it } from 'vitest';
import { extractArticlePdfMetadata } from './article-pdf-parser.js';

function pdf(
  lines: Array<[size: number, y: number, text: string, x?: number]>,
  info = '',
  xmp = '',
): Uint8Array {
  const content = lines
    .map(
      ([size, y, text, x = 72]) =>
        `BT /F1 ${size} Tf ${x} ${y} Td (${text}) Tj ET`,
    )
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R' + (xmp ? ' /Metadata 7 0 R' : '') + ' >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< ${info} >>`,
  ];
  if (xmp) {
    objects.push(
      `<< /Type /Metadata /Subtype /XML /Length ${xmp.length} >>\nstream\n${xmp}\nendstream`,
    );
  }

  let document = '%PDF-1.4\n';
  const offsets = ['0000000000 65535 f \n'];
  for (const [index, object] of objects.entries()) {
    offsets.push(String(document.length).padStart(10, '0') + ' 00000 n \n');
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const crossRef = document.length;
  document += `xref\n0 ${offsets.length}\n${offsets.join('')}trailer\n<< /Root 1 0 R /Info 6 0 R /Size ${offsets.length} >>\nstartxref\n${crossRef}\n%%EOF\n`;
  return new TextEncoder().encode(document);
}

function xmpMetadata(fields: string): string {
  return [
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '<rdf:Description xmlns:prism="http://prismstandard.org/namespaces/basic/2.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    fields,
    '</rdf:Description></rdf:RDF></x:xmpmeta>',
  ].join('');
}

describe('extractArticlePdfMetadata', () => {
  it('finds an unlabeled title and byline and ends a multi-paragraph abstract at a numbered heading', async () => {
    const result = await extractArticlePdfMetadata(
      pdf([
        [28, 750, 'Journal of Environmental Sciences'],
        [20, 699, 'Water quality'],
        [20, 675, 'in the Mekong'],
        [12, 650, 'Mai Nguyen, Bao Tran'],
        [11, 630, 'Environmental Research Institute'],
        [11, 610, 'Abstract: A study of river samples.'],
        [11, 590, 'The introduction to the data is brief.'],
        [13, 573, '1. Introduction'],
        [11, 556, 'This is the main body.'],
      ]),
    );
    expect(result).toEqual({
      title: 'Water quality in the Mekong',
      authorNames: ['Mai Nguyen', 'Bao Tran'],
      abstract:
        'A study of river samples. The introduction to the data is brief.',
    });
  });

  it('preserves ordered XMP creators including a family-name comma', async () => {
    const result = await extractArticlePdfMetadata(
      pdf(
        [],
        '/Author (Unclear, Value)',
        xmpMetadata(
          '<dc:creator><rdf:Seq><rdf:li>Nguyen, Mai</rdf:li><rdf:li>Bao Tran</rdf:li></rdf:Seq></dc:creator>',
        ),
      ),
    );
    expect(result.authorNames).toEqual(['Nguyen, Mai', 'Bao Tran']);
  });

  it.each([0, 6])(
    'keeps an abstract in its column when the facing baselines differ by %ipt',
    async (offset) => {
      const result = await extractArticlePdfMetadata(
        pdf([
          [20, 746, 'Seasonal oxygen in the Mekong'],
          [12, 720, 'Mai Nguyen'],
          [11, 686, 'Abstract: We measured river oxygen.'],
          [11, 670, 'Oxygen rose in summer.'],
          [11, 654, 'Samples came from three sites.'],
          [11, 638, 'High flow affected all three.'],
          [11, 622, 'The pattern persisted until autumn.'],
          [14, 686 - offset, '1. Introduction', 330],
          [11, 670 - offset, 'This is the main body.', 330],
          [11, 654 - offset, 'Historical analysis follows.', 330],
        ]),
      );
      expect(result).toEqual({
        title: 'Seasonal oxygen in the Mekong',
        authorNames: ['Mai Nguyen'],
        abstract:
          'We measured river oxygen. Oxygen rose in summer. Samples came from three sites. High flow affected all three. The pattern persisted until autumn.',
      });
    },
  );

  it('keeps structured abstract subsections before Keywords', async () => {
    const result = await extractArticlePdfMetadata(
      pdf([
        [13, 705, 'Abstract'],
        [11, 691, 'Background:'],
        [11, 677, 'The river changes with the seasons.'],
        [13, 663, 'Methods'],
        [11, 649, 'We measured dissolved oxygen.'],
        [11, 635, 'Results: Oxygen rose in summer.'],
        [11, 621, 'Keywords: water'],
        [13, 607, '1. Introduction'],
      ]),
    );
    expect(result.abstract).toBe(
      'Background: The river changes with the seasons. Methods We measured dissolved oxygen. Results: Oxygen rose in summer.',
    );
  });

  it.each([750, 724])(
    'leaves the title empty when only the masthead at y=%i is prominent',
    async (y) => {
      const result = await extractArticlePdfMetadata(
        pdf([
          [25, y, 'Journal of River Ecology'],
          [12, 694, 'Seasonal Oxygen Study'],
          [12, 676, 'Mai Nguyen'],
          [11, 654, 'Abstract: A study of river samples.'],
        ]),
      );
      expect(result).toEqual({ abstract: 'A study of river samples.' });
    },
  );

  it('does not use an affiliation as a byline', async () => {
    const result = await extractArticlePdfMetadata(
      pdf(
        [
          [20, 712, 'Seasonal oxygen in the Mekong'],
          [12, 684, 'Faculty of Engineering, University of Hanoi'],
          [11, 654, 'Abstract: A study of river samples.'],
        ],
        '/Author (Mai Nguyen, Bao Tran)',
      ),
    );
    expect(result.authorNames).toBeUndefined();
  });

  it.each([
    ['Authors: Mai Nguyen and Bao Tran', ['Mai Nguyen', 'Bao Tran']],
    ['Authors: Mai Nguyen, Bao Tran', ['Mai Nguyen', 'Bao Tran']],
    ['Author: Nguyen, Mai', ['Nguyen, Mai']],
    ['Author: University of Hanoi', ['University of Hanoi']],
    [
      'Author: Research and Development Institute',
      ['Research and Development Institute'],
    ],
  ])('uses the role specified by %s', async (line, names) => {
    const result = await extractArticlePdfMetadata(pdf([[11, 684, line]]));
    expect(result.authorNames).toEqual(names);
  });

  it('skips an ambiguous Author string and still returns the title', async () => {
    expect(
      await extractArticlePdfMetadata(
        pdf(
          [
            [20, 700, 'Water quality in the Mekong'],
            [12, 675, 'Nguyen, Mai'],
            [11, 610, 'Abstract: A study of river samples.'],
          ],
          '/Author (Mai Nguyen, Bao Tran)',
        ),
      ),
    ).toEqual({
      title: 'Water quality in the Mekong',
      abstract: 'A study of river samples.',
    });
  });

  it.each([
    ['https://doi.org/10.1234/study%28a%29', '10.1234/study(a)'],
    ['10.1234/study%28a%29', '10.1234/study%28a%29'],
    ['https://doi.org/10.1234/study%2528', '10.1234/study%28'],
    ['https://doi.org/10.1234/study%xy', undefined],
  ])(
    'normalizes DOI %s at the same boundary as Article creation',
    async (source, expected) => {
      const result = await extractArticlePdfMetadata(
        pdf([[11, 650, 'DOI: ' + source]]),
      );
      expect(result.doi).toBe(expected);
    },
  );

  it.each([
    ['2024-05-17T23:30:00-05:00', '2024-05-17'],
    ['2024-05', '2024-05'],
    ['2024', '2024'],
    ['2024-02-29T09:00:00Z', '2024-02-29'],
    ['2023-02-29T09:00:00Z', undefined],
    ['2024-02-30', undefined],
  ])(
    'preserves source date precision and calendar day for %s',
    async (source, expected) => {
      const result = await extractArticlePdfMetadata(
        pdf(
          [],
          '',
          xmpMetadata(
            '<prism:publicationDate>' + source + '</prism:publicationDate>',
          ),
        ),
      );
      expect(result.publicationDate).toBe(expected);
    },
  );
});
