export const publicationGroups = {
  indexed: 'Tạp chí quốc tế ISI / Scopus',
  international: 'Tạp chí quốc tế khác có bình duyệt',
  domestic: 'Tạp chí chuyên ngành trong nước',
  conference: 'Kỷ yếu hội nghị / hội thảo',
  books: 'Sách, giáo trình và chương sách',
  other: 'Công trình khác',
};

export type PublicationEvidence = {
  type: string;
  venue: string | null;
  publisher: string | null;
  sources: string[];
  peerReviewed: boolean | null;
  doi: string | null;
};

export function classifyOutput(
  output: PublicationEvidence,
): keyof typeof publicationGroups {
  if (['BOOK', 'BOOK_CHAPTER'].includes(output.type)) return 'books';
  if (
    output.type === 'CONFERENCE_PAPER' ||
    /\b(conference|symposium|workshop)\b|hội nghị|hội thảo/iu.test(
      output.venue ?? '',
    )
  )
    return 'conference';
  if (output.type !== 'ARTICLE') return 'other';
  if (output.sources.some((source) => /^(SCOPUS|WOS)$/i.test(source)))
    return 'indexed';
  if (
    /việt nam|tạp chí|\b(vnu|hust)\b/iu.test(
      `${output.venue ?? ''} ${output.publisher ?? ''}`,
    )
  )
    return 'domestic';
  if (output.peerReviewed && output.doi) return 'international';
  return 'other';
}
