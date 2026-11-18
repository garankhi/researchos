/** Output types written by the current application and OpenAlex import. */
export const OutputType = {
  ARTICLE: 'ARTICLE',
  PREPRINT: 'PREPRINT',
  REVIEW: 'REVIEW',
  EDITORIAL: 'EDITORIAL',
  BOOK_CHAPTER: 'BOOK_CHAPTER',
  BOOK: 'BOOK',
  DATASET: 'DATASET',
  DISSERTATION: 'DISSERTATION',
} as const;

export type OutputType = (typeof OutputType)[keyof typeof OutputType];

/** The legacy revision API also supports custom type strings. */
export function canonicalOutputType(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (normalized === 'PAPER') return OutputType.ARTICLE;
  return Object.hasOwn(OutputType, normalized) ? normalized : value;
}
