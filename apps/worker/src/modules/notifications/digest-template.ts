import { readFileSync } from 'node:fs';

interface DigestContent {
  language: string;
  timezone: string;
  periodStart: Date;
  periodEnd: Date;
  outputs: { title: string }[];
}

const subjects = {
  en: 'ResearchOS weekly digest',
  vi: 'Bản tin tuần ResearchOS',
};

const entities: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => entities[char]!);
}

function periodFormatter(
  locale: string,
  timeZone: string,
): Intl.DateTimeFormat {
  const options = { dateStyle: 'medium', timeZone } as const;
  try {
    return new Intl.DateTimeFormat(locale, options);
  } catch (error) {
    // Older rows may contain a time zone that Intl does not recognize.
    if (!(error instanceof RangeError)) throw error;
    return new Intl.DateTimeFormat(locale, {
      ...options,
      timeZone: 'Asia/Ho_Chi_Minh',
    });
  }
}

export class DigestTemplate {
  private readonly templates = {
    en: readFileSync(
      new URL('./templates/digest-v1.en.html', import.meta.url),
      'utf8',
    ),
    vi: readFileSync(
      new URL('./templates/digest-v1.vi.html', import.meta.url),
      'utf8',
    ),
  };

  render({
    language,
    timezone,
    periodStart,
    periodEnd,
    outputs,
  }: DigestContent) {
    const locale = language === 'vi' ? 'vi' : 'en';
    const formatter = periodFormatter(locale, timezone);
    // The scheduled period ends at the start of the next week.
    const lastIncludedInstant = new Date(periodEnd.getTime() - 1);
    const period = formatter.formatRange(periodStart, lastIncludedInstant);
    const items = outputs
      .map(({ title }) => `<li>${escapeHtml(title)}</li>`)
      .join('\n');
    return {
      subject: subjects[locale],
      html: this.templates[locale]
        .replace('{{period}}', () => escapeHtml(period))
        .replace('{{items}}', () => items),
    };
  }
}
