'use client';

import { Box, Heading, Text } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/ui/feedback';

export function OutputAbstract({ abstract }: { abstract: string | null }) {
  const t = useTranslations('outputs');

  return (
    <Box minW="0">
      <Box
        px={{ base: '4', md: '6' }}
        py="4"
        borderBottomWidth="1px"
        borderColor="border"
      >
        <Heading as="h2" size="md" fontWeight="bold">
          {t('detail.abstractTitle')}
        </Heading>
      </Box>

      <Box p={{ base: '4', md: '6' }}>
        {abstract ? (
          <Text textStyle="sm" lineHeight="1.75" whiteSpace="pre-line">
            {abstract}
          </Text>
        ) : (
          <EmptyState
            title={t('detail.noAbstractTitle')}
            message={t('detail.noAbstractMessage')}
          />
        )}
      </Box>
    </Box>
  );
}
