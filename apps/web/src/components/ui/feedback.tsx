'use client';

import {
  Alert,
  Button,
  Container,
  Heading,
  Icon,
  Skeleton,
  Stack,
  Text,
} from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

export function LoadingSkeleton({
  variant = 'text',
  width,
  height = variant === 'text' ? '1em' : undefined,
  count = 1,
}: {
  variant?: 'text' | 'rectangular' | 'circular';
  width?: number | string;
  height?: number | string;
  count?: number;
}) {
  // Chakra treats numbers as size tokens. This component accepts pixels.
  const cssWidth = typeof width === 'number' ? `${width}px` : width;
  const cssHeight = typeof height === 'number' ? `${height}px` : height;
  const items = Array.from({ length: count }, (_, index) => (
    <Skeleton
      key={index}
      w={cssWidth}
      h={cssHeight}
      borderRadius={variant === 'circular' ? 'full' : 'l2'}
      aria-hidden
      data-testid="loading-skeleton"
    />
  ));

  return count === 1 ? (
    items[0]
  ) : (
    <Stack gap="1" aria-busy="true">
      {items}
    </Stack>
  );
}

export function ListItemSkeleton() {
  return (
    <Stack
      direction="row"
      gap="2"
      align="center"
      aria-busy="true"
      data-testid="list-item-skeleton"
    >
      <LoadingSkeleton variant="circular" width={40} height={40} />
      <Stack flex="1" gap="1">
        <LoadingSkeleton />
        <LoadingSkeleton width="60%" />
      </Stack>
    </Stack>
  );
}

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
    <Alert.Root
      status="error"
      variant="outline"
      role="alert"
      flexWrap="wrap"
      gap="3"
    >
      <Alert.Indicator />
      <Alert.Content flex="1" minW="12rem">
        <Alert.Title>{title}</Alert.Title>
        {message && <Alert.Description>{message}</Alert.Description>}
      </Alert.Content>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t('retry')}
        </Button>
      )}
      {action}
    </Alert.Root>
  );
}

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
      gap="1"
      align="center"
      textAlign="center"
      py="6"
      px="3"
      data-testid="empty-state"
    >
      <Text fontWeight="medium">{title}</Text>
      {message && (
        <Text textStyle="sm" color="fg.muted">
          {message}
        </Text>
      )}
      {action}
    </Stack>
  );
}

// Pass the id to aria-describedby on the corresponding input.
export function FieldError({
  children,
  id,
}: {
  children: ReactNode;
  id?: string;
}) {
  return (
    <Text id={id} textStyle="sm" color="fg.error">
      {children}
    </Text>
  );
}

export function RouteFeedback({
  icon,
  title,
  description,
  action,
  role,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action: ReactNode;
  role?: 'alert';
}) {
  return (
    <Container as="main" maxW="lg" py="8">
      <Stack gap="3" align="center" textAlign="center" role={role}>
        <Icon size="2xl" color={role ? 'fg.error' : 'fg.muted'}>
          {icon}
        </Icon>
        <Heading as="h1" size="xl">
          {title}
        </Heading>
        <Text color="fg.muted">{description}</Text>
        {action}
      </Stack>
    </Container>
  );
}
