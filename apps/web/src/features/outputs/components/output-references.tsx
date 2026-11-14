'use client';

import { Box, Text } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/ui/feedback';

export function OutputReferences() {
  const t = useTranslations('outputs');

  return (
    <Box bg="bg.panel" borderWidth="1px" borderRadius="lg" p={{ base: '4', md: '6' }}>
      <Text fontWeight="semibold" mb="2">
        {t('detail.referencesTitle')}
      </Text>
      <EmptyState
        title={t('detail.referencesEmptyTitle')}
        message={t('detail.referencesEmptyMessage')}
      />
    </Box>
  );
}
