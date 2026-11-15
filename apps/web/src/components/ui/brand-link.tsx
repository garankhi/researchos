'use client';

import { Box, Link } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import NextLink from './link';

export function BrandLink() {
  const t = useTranslations('common');

  return (
    <Link asChild flexShrink="0">
      <NextLink href="/">
        <Box
          as="span"
          role="img"
          aria-label={t('appName')}
          display="block"
          width={{ base: '156px', lg: '142px' }}
          aspectRatio="550 / 96"
          bg="#152323"
          _dark={{ bg: '#ecedeb' }}
          css={{
            mask: 'url(/researchos-wordmark.svg) center / contain no-repeat',
            '@media (forced-colors: active)': {
              forcedColorAdjust: 'none',
              backgroundColor: 'CanvasText',
            },
          }}
        />
      </NextLink>
    </Link>
  );
}
