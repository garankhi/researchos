'use client';

import { useEffect } from 'react';
import { Button } from '@chakra-ui/react';
import { CircleAlert } from 'lucide-react';
import { RouteFeedback } from '@/components/ui/feedback';
import { useTranslations } from 'next-intl';

/**
 * Route-level error boundary.
 *
 * Catches uncaught errors thrown while rendering this route segment and its
 * children. Nested segments can define their own `error.tsx`; the nearest
 * boundary wins.
 *
 * `retry()` re-fetches and re-renders the segment's children. It is stable
 * since Next 16.3.0.
 *
 * This boundary does NOT wrap the segment's `layout.tsx` or `template.tsx`.
 * For a failure in the root layout itself, use `global-error.tsx`.
 *
 * Note the component is deliberately NOT named `Error`: a default export
 * named `Error` shadows the global `Error` constructor inside this module,
 * which breaks `instanceof Error` checks.
 */
export default function RouteError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const t = useTranslations('errors');

  useEffect(() => {
    // Replace with your error reporting service. In production the message
    // is stripped, so correlate using `error.digest` instead.
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
