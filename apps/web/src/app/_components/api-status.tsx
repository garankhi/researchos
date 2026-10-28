'use client';

import { ErrorState, LoadingSkeleton } from '@/components/ui/feedback';
import { useApiHealth } from '@/features/health';

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
  const { data, isPending, isFailed, refetch } = useApiHealth();

  if (isPending) return <LoadingSkeleton variant="text" width={220} />;

  if (isFailed) {
    return (
      <ErrorState
        title="Không kết nối được API"
        message="Hãy chắc chắn API đang chạy tại cổng 4000, rồi thử lại."
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <p>
      API trả về: {data?.status} ({data?.service})
    </p>
  );
}
