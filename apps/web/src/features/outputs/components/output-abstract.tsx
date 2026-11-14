'use client';

import { Box, Text } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/ui/feedback';

export function OutputAbstract({ abstract }: { abstract: string | null }) {
  const t = useTranslations('outputs');

  return (
    <Box bg="bg.panel" borderWidth="1px" borderRadius="lg" p={{ base: '4', md: '6' }}>
      <Text fontWeight="semibold" mb="2">
        {t('detail.abstractTitle')}
      </Text>
      {abstract ? (
        <Text textStyle="sm" whiteSpace="pre-line">
          {abstract}
        </Text>
      ) : (
        <EmptyState
          title={t('detail.noAbstractTitle')}
          message={t('detail.noAbstractMessage')}
        />
      )}
    </Box>
  );
}
