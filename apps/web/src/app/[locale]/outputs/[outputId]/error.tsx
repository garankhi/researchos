'use client';

import { useEffect } from 'react';
import { Button } from '@chakra-ui/react';
import { CircleAlert } from 'lucide-react';
import { RouteFeedback } from '@/components/ui/feedback';
import { useTranslations } from 'next-intl';

/**
 * Route-level error boundary for the publication detail segment.
 *
 * Props are `error` and `retry` (not `reset`); `error` is `unknown`
 * and narrowed before reading `.message`. The component is not named
 * `Error` so it does not shadow the global constructor.
 */
export default function OutputSegmentError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const t = useTranslations('errors');

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <RouteFeedback
      role="alert"
      icon={<CircleAlert aria-hidden />}
      title={t('title')}
      description={t('description')}
      action={<Button onClick={retry}>{t('retry')}</Button>}
    />
  );
}
