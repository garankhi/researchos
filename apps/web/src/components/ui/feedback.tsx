'use client';

import {
  Alert,
  AlertTitle,
  Button,
  FormHelperText,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Shared loading and error display primitives.
 *
 * Standards for ResearchOS screens:
 * - Block loading states are skeletons that match the shape of the content
 *   they replace. A spinner hides the layout; a skeleton reserves the space
 *   and avoids a layout shift when data arrives. Skeletons are for content
 *   that occupies an area of the page — a list, a card, a detail panel.
 * - Mutations do not change the layout, so their indicator belongs in the
 *   button: `<Button loading={mutation.isPending}>`. See the
 *   `researchos-ui` skill.
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
  const t = useTranslations('common');

  return (
    <Alert
      severity="error"
      variant="outlined"
      role="alert"
      action={
        onRetry ? (
          <Button color="inherit" size="small" onClick={onRetry}>
            {t('retry')}
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

/**
 * A validation message for one field.
 *
 * The backend groups validation failures by field — a `400` carries
 * `errors: [{ field, messages }]` — precisely so each message can sit under
 * the input that caused it. Render one of these per invalid field instead
 * of flattening the whole group into a single toast line.
 *
 * `messages` holds every message the server sent for that field. Pass them
 * as separate children so each one gets its own line.
 *
 * ```tsx
 * const t = useTranslations('errors');
 * const fieldMessages = resolveFieldErrorCodes(
 *   t,
 *   apiFieldErrorCodes(mutation.error),
 *   t('unknown'),
 * );
 *
 * {Object.entries(fieldMessages ?? {}).map(([field, message]) => (
 *   <FieldError key={field}>{message}</FieldError>
 * ))}
 * ```
 *
 * Note: in the target contract the validation wording is a **code**, resolved
 * against the message catalog by `resolveFieldErrorCodes()`. The backend
 * does not send codes yet, so today every field falls back to a localized
 * generic message. See the `researchos-localization` skill.
 */
export function FieldError({
  children,
  id,
}: {
  children: ReactNode;
  /**
   * Id of the input this message describes. Pass the same value to the
   * input's `aria-describedby` so a screen reader announces the error with
   * the field rather than on its own.
   */
  id?: string;
}) {
  return (
    <FormHelperText id={id} error sx={{ mx: 0 }}>
      {children}
    </FormHelperText>
  );
}
