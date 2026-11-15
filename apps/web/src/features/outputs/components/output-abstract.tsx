'use client';

import { Stack, Text } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/ui/feedback';

export function OutputAbstract({ abstract }: { abstract: string | null }) {
  const t = useTranslations('outputs');

  return (
    <Stack gap="2" minW="0">
      <Text fontWeight="semibold">{t('detail.abstractTitle')}</Text>
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
    </Stack>
  );
}
