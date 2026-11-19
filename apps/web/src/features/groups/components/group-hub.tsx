'use client';

import { GroupHubSkeleton } from './group-skeletons';

import { Container } from '@chakra-ui/react';
import { forbidden, notFound, unauthorized } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { RequireAuth } from '@/features/identity';
import { apiErrorCode, apiStatusCode } from '@/lib/api-error';
import { resolveErrorCode } from '@/utils/error-messages';
import { ErrorState } from '@/components/ui/feedback';
import { useGroupHub } from '../hooks/use-group-hub';
import { GroupShell } from './group-shell';

function HubContent({ groupId }: { groupId: string }) {
  const t = useTranslations('groups');
  const errors = useTranslations('errors');
  const hub = useGroupHub(groupId);
  const group = hub.group.data;
  const permissions = hub.permissions;
  if (hub.group.isPending) return <GroupHubSkeleton />;
  if (hub.group.isError) {
    const status = apiStatusCode(hub.group.error);
    if (status === 404 || status === 400) notFound();
    if (status === 401) unauthorized();
    if (status === 403) forbidden();
    return (
      <Container
        maxW="64rem"
        px={{ base: '4', md: '6' }}
        py={{ base: '4', md: '8' }}
      >
        <ErrorState
          title={t('loadError')}
          message={resolveErrorCode(
            errors,
            apiErrorCode(hub.group.error),
            errors('unknown'),
          )}
          onRetry={() => void hub.group.refetch()}
        />
      </Container>
    );
  }
  if (!group || !permissions) return null;
  return (
    <GroupShell
      groupId={groupId}
      group={group}
      permissions={permissions}
      hub={hub}
    />
  );
}

export function GroupHub({ groupId }: { groupId: string }) {
  return (
    <RequireAuth>
      <HubContent key={groupId} groupId={groupId} />
    </RequireAuth>
  );
}
