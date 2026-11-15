'use client';

import { ErrorState } from '@/components/ui/feedback';
import { ApiStatusSkeleton, useApiHealth } from '@/features/health';
import { useTranslations } from 'next-intl';

/**
 * Temporary scaffold component that checks API connectivity.
 *
 * Demonstrates the query state standards: a skeleton while pending, an
 * actionable error state on failure, and the data itself on success.
 *
 * It goes through the `health` feature hook rather than the generated
 * client directly, so the feature layer stays the single place that knows
 * how API health is modelled.
 */
export function ApiStatus() {
  const t = useTranslations('errors');
  const tHome = useTranslations('home');
  const { data, isPending, isFailed, refetch } = useApiHealth();

  if (isPending) return <ApiStatusSkeleton />;

  if (isFailed) {
    return (
      <ErrorState
        title={t('apiUnreachableTitle')}
        message={t('apiUnreachableDescription')}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <p>
      {tHome('apiResponse', {
        status: data?.status ?? '',
        service: data?.service ?? '',
      })}
    </p>
  );
}
