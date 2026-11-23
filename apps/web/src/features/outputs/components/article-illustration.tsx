import Image from 'next/image';

const sizes = {
  header: 56,
  discovery: 96,
  published: 104,
  'pdf-file': 48,
} as const;

export function ArticleIllustration({ kind }: { kind: keyof typeof sizes }) {
  return (
    <Image
      src={`/article-creation/${kind}.png`}
      alt=""
      width={sizes[kind]}
      height={sizes[kind]}
      loading="eager"
      unoptimized
    />
  );
}
