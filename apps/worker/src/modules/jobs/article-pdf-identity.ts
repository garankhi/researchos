import type { ArticlePdfMetadata } from '@researchos/queue';

export function comparableArticleText(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim();
}

export function generatedTitle(title?: string) {
  return Boolean(
    title &&
    /^(?:microsoft word\s*[-:]|untitled$)|\.(?:docx?|dvi|tex|pdf|ps)$/iu.test(
      title,
    ),
  );
}

function matchesTitle(candidate: string, visibleTitle: string) {
  const embedded = comparableArticleText(candidate);
  const visible = comparableArticleText(visibleTitle);
  // One source can wrap the subtitle or only include the main title.
  return embedded === visible || embedded.startsWith(visible + ' ');
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

export function selectArticleIdentity(
  sources: readonly Pick<ArticlePdfMetadata, 'title' | 'authorNames'>[],
  visible: {
    title?: string;
    authorNames?: string[];
    firstByline?: string[];
  },
): Pick<ArticlePdfMetadata, 'title' | 'authorNames'> {
  const title =
    sources.find(
      ({ title }) =>
        title &&
        !generatedTitle(title) &&
        (!visible.title || matchesTitle(title, visible.title)),
    )?.title ?? visible.title;
  const byline = visible.authorNames ?? visible.firstByline;
  const authorNames =
    sources.find(
      ({ authorNames }) =>
        authorNames &&
        (!byline ||
          ((visible.authorNames
            ? authorNames.length === byline.length
            : authorNames.length >= byline.length) &&
            byline.every((name, index) =>
              matchesName(authorNames[index], name),
            ))),
    )?.authorNames ?? visible.authorNames;
  const displayNames = visible.authorNames
    ? authorNames?.map((name, index) => {
        const printed = visible.authorNames![index];
        return nameWords(name).join(' ') === nameWords(printed).join(' ') &&
          !/\p{M}/u.test(name.normalize('NFD')) &&
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
