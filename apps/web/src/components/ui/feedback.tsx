'use client';

import {
  Alert,
  AlertTitle,
  Button,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import type { ReactNode } from 'react';

/**
 * Shared loading and error display primitives.
 *
 * Standards for ResearchOS screens:
 * - Loading states are skeletons that match the shape of the content they
 *   replace, not spinners. A spinner hides the layout; a skeleton reserves
 *   the space and avoids a layout shift when data arrives.
 * - Every error state offers a way forward. A dead-end message with no
 *   recovery action is a bug, not an error state.
 * - Errors are scoped: say what failed, not "something went wrong".
 *
 * Note: MUI v9 removed system props (`gap`, `flex`, `py`, `px`, `alignItems`)
 * from the direct prop surface. They must go through `sx` or they leak onto
 * the DOM as invalid HTML attributes. `spacing` on Stack still works.
 */

export function LoadingSkeleton({
  variant = 'text',
  width,
  height,
  count = 1,
}: {
  variant?: 'text' | 'rectangular' | 'circular';
  width?: number | string;
  height?: number | string;
  count?: number;
}) {
  if (count === 1) {
    return (
      <Skeleton
        variant={variant}
        width={width}
        height={height}
        aria-hidden
        data-testid="loading-skeleton"
      />
    );
  }

  return (
    <Stack spacing={1} aria-busy="true" aria-live="polite">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton
          key={index}
          variant={variant}
          width={width}
          height={height}
          aria-hidden
          data-testid="loading-skeleton"
        />
      ))}
    </Stack>
  );
}

/**
 * Card-shaped skeleton for a list item or feed entry.
 */
export function ListItemSkeleton() {
  return (
    <Stack
      direction="row"
      spacing={2}
      aria-busy="true"
      aria-live="polite"
      data-testid="list-item-skeleton"
      sx={{ alignItems: 'center' }}
    >
      <Skeleton variant="circular" width={40} height={40} aria-hidden />
      <Stack spacing={1} sx={{ flex: 1 }}>
        <Skeleton variant="text" height={20} aria-hidden />
        <Skeleton variant="text" width="60%" aria-hidden />
      </Stack>
    </Stack>
  );
}

/**
 * Error state with an optional recovery action.
 */
export function ErrorState({
  title,
  message,
  action,
  onRetry,
}: {
  title: string;
  message?: ReactNode;
  action?: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <Alert
      severity="error"
      variant="outlined"
      role="alert"
      action={
        onRetry ? (
          <Button color="inherit" size="small" onClick={onRetry}>
            Thử lại
          </Button>
        ) : null
      }
      sx={{ alignItems: 'center' }}
    >
      <AlertTitle>{title}</AlertTitle>
      {message ? <Typography variant="body2">{message}</Typography> : null}
      {action}
    </Alert>
  );
}

/**
 * Empty state for a list that loaded successfully but has nothing in it.
 */
export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Stack
      spacing={1}
      data-testid="empty-state"
      sx={{ alignItems: 'center', textAlign: 'center', py: 6, px: 3 }}
    >
      <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
        {title}
      </Typography>
      {message ? (
        <Typography variant="body2" color="text.secondary">
          {message}
        </Typography>
      ) : null}
      {action}
    </Stack>
  );
}
