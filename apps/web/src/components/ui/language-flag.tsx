import type { Locale } from '@/i18n/routing';

const flagArtwork = {
  vi: (
    <>
      <rect fill="#DA251D" width="60" height="40" />
      <path
        fill="#FFFF00"
        d="m30 8 2.8 8.3h8.7l-7 5.2 2.7 8.3-7.2-5.1-7.2 5.1 2.7-8.3-7-5.2h8.7z"
      />
    </>
  ),
  en: (
    <>
      <rect fill="#012169" width="60" height="40" />
      <path stroke="#FFF" strokeWidth="8" d="m0 0 60 40M60 0 0 40" />
      <path
        fill="#C8102E"
        d="M0 0h3l27 18v2zm60 0v2L30 22v-2zm0 40h-3L30 22v-2zM0 40v-2l30-20v2z"
      />
      <path stroke="#FFF" strokeWidth="12" d="M30 0v40M0 20h60" />
      <path stroke="#C8102E" strokeWidth="7" d="M30 0v40M0 20h60" />
    </>
  ),
};

export function LanguageFlag({ locale }: { locale: Locale }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 60 40" width="20" height="14">
      {flagArtwork[locale]}
    </svg>
  );
}
