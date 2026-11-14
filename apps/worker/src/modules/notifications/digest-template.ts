import { readFileSync } from 'node:fs';

export interface DigestOutput {
  title: string;
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

  render(language: string | null, outputs: DigestOutput[]) {
    const locale = language === 'vi' ? 'vi' : 'en';
    const items = outputs
      .map(
        ({ title }) =>
          `<li>${title.replace(/[&<>"']/g, (char) => entities[char]!)}</li>`,
      )
      .join('\n');
    return {
      subject: subjects[locale],
      html: this.templates[locale].replace('{{items}}', () => items),
    };
  }
}
