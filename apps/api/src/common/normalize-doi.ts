const RESOLVER_URL = /^https?:\/\/(?:dx\.)?doi\.org\/([^?#]*)/i;
const CONTROL_CHARACTER = /\p{Cc}/u;

/** Normalize a DOI name or the path of a doi.org resolver URL. */
export function normalizeDoi(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const text = value.trim();
  const resolver = RESOLVER_URL.exec(text);
  let name = text.replace(/^doi:\s*/i, '');
  if (resolver) {
    try {
      // A DOI name can contain a literal percent escape. Decode only URLs.
      name = decodeURIComponent(resolver[1]);
    } catch {
      return null;
    }
    if (CONTROL_CHARACTER.test(name)) return null;
  }

  const doi = name.trim();
  if (!doi || CONTROL_CHARACTER.test(doi)) return null;

  // DOI equivalence folds the Basic Latin letters.
  return doi.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}
