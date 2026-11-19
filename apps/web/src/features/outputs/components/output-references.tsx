'use client';

import { Box, Heading } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/ui/feedback';

export function OutputReferences() {
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
          {t('detail.referencesTitle')}
        </Heading>
      </Box>

      <Box p={{ base: '4', md: '6' }}>
        <EmptyState
          title={t('detail.referencesEmptyTitle')}
          message={t('detail.referencesEmptyMessage')}
        />
      </Box>
    </Box>
  );
}
