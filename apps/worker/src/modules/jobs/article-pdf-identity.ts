import type { ArticlePdfMetadata } from '@researchos/queue';

export function comparableArticleText(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim();
}

export function comparableAbstractText(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[-‐]\s+(?=\p{Ll})/gu, '')
    .replace(/[‐‑‒–—]/gu, '-')
    .replace(/\s+/gu, '');
}

export function generatedTitle(title?: string) {
  return Boolean(
    title &&
    /^(?:microsoft word\s*[-:]|untitled$)|\.(?:docx?|dvi|tex|pdf|ps)$/iu.test(
      title,
    ),
  );
}

export const articleTypeLabel =
  /^(?:(?:original|research|review|full length|invited|regular|special issue|technical) (?:article|paper|report)|short communication|case report|editorial|article)\s*[.:]?$/iu;

export const publicationMasthead =
  /^(?:(?:the\s+)?(?:[\p{L}-]+\s+){0,3}journal\s+of\b|(?:(?:e-?)?issn|vol(?:ume)?)[\s.:])/iu;

export function articleTitle(value: string): boolean {
  return (
    !generatedTitle(value) &&
    !articleTypeLabel.test(value) &&
    !publicationMasthead.test(value)
  );
}

function nameWords(value: string) {
  return comparableArticleText(
    value.normalize('NFKD').replace(/\p{M}/gu, ''),
  ).split(' ');
}

function sameNamePart(first: string, second: string) {
  return (
    first === second ||
    (first.length === 1 && second.startsWith(first)) ||
    (second.length === 1 && first.startsWith(second))
  );
}

function matchesName(candidate: string, visible: string) {
  if (comparableArticleText(candidate) === comparableArticleText(visible))
    return true;
  const [given, ...rest] = nameWords(visible);
  const surname = rest.at(-1);
  const words = nameWords(candidate);
  if (!surname) return false;
  const familyIndex = words.lastIndexOf(surname);
  const givenIndex = words.findIndex(
    (word, index) => index !== familyIndex && sameNamePart(word, given),
  );
  if (familyIndex < 0 || givenIndex < 0) return false;
  const visibleMiddle = rest.slice(0, -1);
  const candidateMiddle = words.filter(
    (_, index) => index !== givenIndex && index !== familyIndex,
  );
  return (
    !visibleMiddle.length ||
    !candidateMiddle.length ||
    (visibleMiddle.length === candidateMiddle.length &&
      visibleMiddle.every((word, index) =>
        sameNamePart(word, candidateMiddle[index]),
      ))
  );
}

type IdentityCandidate = Pick<ArticlePdfMetadata, 'title' | 'authorNames'> & {
  origin: 'xmp' | 'pdf-info' | 'tei' | 'verified';
  headingMatched?: boolean;
};

export function selectArticleIdentity(
  sources: readonly IdentityCandidate[],
  visible: {
    title?: string;
    authorNames?: string[];
    firstByline?: string[];
    bylineUnresolved?: boolean;
  },
): Pick<ArticlePdfMetadata, 'title' | 'authorNames'> {
  const printedTitle =
    visible.title && articleTitle(visible.title) ? visible.title : undefined;
  const title =
    sources.find(
      ({ title, origin, headingMatched }) =>
        title &&
        articleTitle(title) &&
        (printedTitle
          ? comparableArticleText(title) === comparableArticleText(printedTitle)
          : headingMatched || origin === 'xmp' || origin === 'verified'),
    )?.title ?? printedTitle;
  const byline = visible.authorNames ?? visible.firstByline;
  const authorNames =
    (visible.bylineUnresolved && !visible.authorNames
      ? undefined
      : sources.find(
          ({ authorNames, origin }) =>
            authorNames &&
            (byline
              ? authorNames.length === byline.length &&
                byline.every((name, index) =>
                  matchesName(authorNames[index], name),
                )
              : origin === 'xmp' || origin === 'verified'),
        )?.authorNames) ?? visible.authorNames;
  const displayNames = visible.authorNames
    ? authorNames?.map((name, index) => {
        const printed = visible.authorNames![index];
        return nameWords(name).join(' ') === nameWords(printed).join(' ') &&
          comparableArticleText(name) !== comparableArticleText(printed) &&
          /\p{M}/u.test(printed.normalize('NFD'))
          ? printed
          : name;
      })
    : authorNames;
  return {
    ...(title && { title }),
    ...(displayNames && { authorNames: displayNames }),
  };
}
