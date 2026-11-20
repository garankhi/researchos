const RESOLVER_URL = /^https?:\/\/(?:dx\.)?doi\.org\/([^?#]*)/i;
const CONTROL_CHARACTER = /\p{Cc}/u;
const ARTICLE_DOI = /^10\.\d{4,}(?:\.\d+)*\/\S+$/u;
const PUBLICATION_DATE =
  /^([1-9]\d{3})(?:-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?)?$/;

/** Normalize a DOI name or the path of a doi.org resolver URL. */
export function normalizeDoi(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const text = value.trim();
  const resolver = RESOLVER_URL.exec(text);
  let name = text.replace(/^doi:\s*/i, "");
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

export function normalizeArticleDoi(value: unknown): string | null {
  const doi = normalizeDoi(value);
  return doi && doi.length <= 255 && ARTICLE_DOI.test(doi) ? doi : null;
}

/** Validate the calendar fields at the precision the source actually supplied. */
export function parsePublicationDate(value: string): string | undefined {
  const parts = PUBLICATION_DATE.exec(value);
  if (!parts) return undefined;
  const [, year, month, day] = parts;
  return !day ||
    Number(day) <= new Date(Date.UTC(+year, +month, 0)).getUTCDate()
    ? value
    : undefined;
}
