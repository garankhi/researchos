'use client';

import { useEffect } from 'react';
import { ErrorState } from './feedback';
import { catchError, type ErrorInfo } from 'next/error';

/**
 * Component-level error boundary for ResearchOS.
 *
 * `catchError` (stable since Next 16.3) is preferred over a hand-rolled
 * error boundary class because it:
 * - re-renders inside a Transition, so Client Component state outside the
 *   boundary survives a recoverable error;
 * - lets `redirect()` and `notFound()` pass through instead of swallowing
 *   them as generic failures;
 * - clears the error state on client navigation.
 *
 * Usage:
 *   <ErrorBoundary title="..."><SomeWidget /></ErrorBoundary>
 *
 * Note this is for component-level recovery. Route-level failures belong in
 * `app/error.tsx`, which renders inside Next's own boundary.
 */

function ErrorFallback(
  { title, message }: { title: string; message?: string },
  { error, retry }: ErrorInfo,
) {
  useEffect(() => {
    // Replace with your error reporting service. `error.digest` correlates
    // a production error with the server-side log entry.
    console.error(error);
  }, [error]);

  return <ErrorState title={title} message={message} onRetry={retry} />;
}

export default catchError(ErrorFallback);
