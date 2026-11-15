'use client';

import {
  Alert,
  Button,
  Container,
  Heading,
  Icon,
  Stack,
  Text,
} from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

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
