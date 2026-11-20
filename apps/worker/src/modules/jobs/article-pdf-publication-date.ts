import { parsePublicationDate } from '@researchos/publication-metadata';

type PublicationEvent = 'online' | 'print' | 'published';
const publicationLabels: ReadonlyArray<[PublicationEvent, RegExp]> = [
  [
    'online',
    /^(?:first published online|published online|online publication date|available online|e-?pub|xuất bản trực tuyến)\b/iu,
  ],
  [
    'print',
    /^(?:published in print|print publication date|xuất bản bản in)\b/iu,
  ],
  [
    'published',
    /^(?:first published|date of publication|publication date|published|ngày xuất bản)(?=\s|:|$)/iu,
  ],
];
const months = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

export function readEmbeddedPublicationDate(
  value: unknown,
): string | undefined {
  if (typeof value !== 'string') return undefined;
  const candidate = value.trim();
  const timestamp =
    /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$/u.exec(
      candidate,
    );
  // Keep the calendar date at the original offset.
  return parsePublicationDate(timestamp?.[1] ?? candidate);
}

function calendarDate(year: string, month: string | number, day?: string) {
  return parsePublicationDate(
    year +
      '-' +
      String(month).padStart(2, '0') +
      (day ? '-' + day.padStart(2, '0') : ''),
  );
}

function monthNumber(name: string) {
  return (
    months.findIndex((month) => month === name || month.slice(0, 3) === name) +
    1
  );
}

function readCalendarDate(text: string, vietnamese: boolean) {
  const input = text.trim().toLowerCase();
  const iso = /^(\d{4}(?:-\d{2}(?:-\d{2})?)?)(?![\p{L}\p{N}/-])/u.exec(input);
  if (iso) return parsePublicationDate(iso[1]);

  const local =
    /^(?:ngày\s+)?(?:(\d{1,2})\s+)?tháng\s+(\d{1,2})\s+năm\s+(\d{4})\b/iu.exec(
      input,
    );
  if (local) return calendarDate(local[3], local[2], local[1]);
  const numeric = /^(\d{1,2})\/(?:(\d{1,2})\/)?(\d{4})\b/u.exec(input);
  if (numeric) {
    const [, first, second, year] = numeric;
    if (!second) return calendarDate(year, first);
    if (vietnamese || Number(first) > 12)
      return calendarDate(year, second, first);
    if (Number(second) > 12 || Number(first) === Number(second))
      return calendarDate(year, first, second);
    return undefined;
  }
  const dayFirst = /^(\d{1,2})\s+([a-z]+)\.?\s+(\d{4})\b/u.exec(input);
  if (dayFirst)
    return calendarDate(dayFirst[3], monthNumber(dayFirst[2]), dayFirst[1]);
  const monthFirst = /^([a-z]+)\.?\s+(?:(\d{1,2}),?\s+)?(\d{4})\b/u.exec(input);
  return monthFirst
    ? calendarDate(monthFirst[3], monthNumber(monthFirst[1]), monthFirst[2])
    : undefined;
}

function readPublicationEvents(lines: readonly string[]) {
  const events = new Map<PublicationEvent, Set<string>>();
  for (const line of lines) {
    for (const part of line.normalize('NFC').split(';')) {
      const text = part.trim();
      for (const [event, label] of publicationLabels) {
        const match = label.exec(text);
        if (!match) continue;
        const date = readCalendarDate(
          text
            .slice(match[0].length)
            .replace(/^\s*(?:(?:on\b)|[:–—])\s*/iu, ''),
          /^(?:ngày|xuất)/iu.test(match[0]),
        );
        if (date) {
          const dates = events.get(event) ?? new Set<string>();
          dates.add(date);
          events.set(event, dates);
        }
        break;
      }
    }
  }
  return events;
}

export function selectPublicationDate(
  lines: readonly string[],
  embedded?: string,
): string | undefined {
  const events = readPublicationEvents(lines);
  const dates = new Map<PublicationEvent, string>();
  for (const [event, values] of events) {
    const mostPrecise = [...values].sort((a, b) => b.length - a.length)[0];
    // A year or month may be a less precise representation of the same event.
    if ([...values].some((value) => !mostPrecise.startsWith(value)))
      return undefined;
    dates.set(event, mostPrecise);
  }
  // ISO partial dates sort by their earliest possible day. If two distinct
  // events overlap, preserve the earlier candidate's actual precision.
  return [...dates.values()].sort()[0] ?? embedded;
}
