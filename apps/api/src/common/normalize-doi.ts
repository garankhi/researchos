/** Mirrors the work DOI trigger: strip the resolver prefix, trim and lowercase. */
export function normalizeDoi(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const doi = value
    .trim()
    .replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/i, '')
    .trim()
    .toLowerCase();
  return doi === '' ? null : doi;
}
