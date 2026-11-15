'use client';

import { Stack, Text } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/ui/feedback';

export function OutputReferences() {
  const t = useTranslations('outputs');

  return (
    <Stack gap="2" minW="0">
      <Text fontWeight="semibold">{t('detail.referencesTitle')}</Text>
      <EmptyState
        title={t('detail.referencesEmptyTitle')}
        message={t('detail.referencesEmptyMessage')}
      />
    </Stack>
  );
}
