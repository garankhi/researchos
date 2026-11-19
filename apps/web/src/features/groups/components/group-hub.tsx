'use client';

import { GroupHubSkeleton } from './group-skeletons';

import { Badge, Container, Grid, Heading, Stack, Text } from '@chakra-ui/react';
import { forbidden, notFound, unauthorized } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { RequireAuth } from '@/features/identity';
import { groupsControllerUpdate } from '@/lib/api';
import { apiErrorCode, apiStatusCode } from '@/lib/api-error';
import { resolveErrorCode } from '@/utils/error-messages';
import { ErrorState } from '@/components/ui/feedback';
import { useGroupHub } from '../hooks/use-group-hub';
import { HubAction, HubEditor, HubMenu, HubSection } from './hub-controls';
import { GroupMembers } from './group-members';
import { GroupDirections } from './group-directions';
import { GroupOutputs } from './group-outputs';
import { GroupOpportunities } from './group-opportunities';
import { GroupApplications } from './group-applications';

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
      <ErrorState
        title={t('loadError')}
        message={resolveErrorCode(
          errors,
          apiErrorCode(hub.group.error),
          errors('unknown'),
        )}
        onRetry={() => void hub.group.refetch()}
      />
    );
  }
  if (!group || !permissions) return null;
  const active = group.isActive && !group.archivedAt;
  return (
    <Stack gap="6">
      <Badge
        alignSelf="start"
        colorPalette={permissions.editInfo ? 'blue' : 'gray'}
      >
        {t(permissions.editInfo ? 'managementView' : 'readonlyView')}
      </Badge>
      <HubSection title={t('info')}>
        <Heading
          as="h1"
          size={{ base: '2xl', md: '3xl' }}
          overflowWrap="anywhere"
          pe="10"
        >
          {group.name}
        </Heading>
        <Text color="fg.muted">{group.code}</Text>
        <Badge alignSelf="start" colorPalette={active ? 'green' : 'gray'}>
          {t(active ? 'active' : 'archived')}
        </Badge>
        <Text whiteSpace="pre-wrap">{group.description}</Text>
        {permissions.editInfo ? (
          <HubMenu>
            <HubEditor
              groupId={groupId}
              label={t('editGroup')}
              title={t('editGroup')}
              fields={[
                {
                  name: 'name',
                  label: t('name'),
                  initial: group.name,
                  required: true,
                  max: 255,
                },
                {
                  name: 'code',
                  label: t('code'),
                  initial: group.code,
                  required: true,
                  max: 50,
                },
                {
                  name: 'description',
                  label: t('description'),
                  initial: group.description ?? '',
                  type: 'textarea',
                },
              ]}
              submit={(values) =>
                groupsControllerUpdate(groupId, {
                  name: values.name,
                  code: values.code,
                  description: values.description || null,
                })
              }
            />
            <HubAction
              groupId={groupId}
              label={t(active ? 'archiveGroup' : 'restoreGroup')}
              confirm
              danger={active}
              action={() =>
                groupsControllerUpdate(groupId, { isActive: !active })
              }
            />
          </HubMenu>
        ) : null}
      </HubSection>
      <Grid
        templateColumns={{
          base: 'minmax(0, 1fr)',
          lg: 'minmax(0, 2fr) minmax(300px, 1fr)',
        }}
        gap="6"
        alignItems="start"
      >
        <GroupOutputs
          groupId={groupId}
          canManage={permissions.manageOutputs}
          query={hub.outputs}
          pendingQuery={hub.pendingOutputs}
        />
        <Stack gap="6" minW="0">
          <GroupMembers
            groupId={groupId}
            leadId={group.leadId}
            active={active}
            canManage={permissions.manageMembers}
            query={hub.members}
          />
          <GroupDirections
            groupId={groupId}
            canPublish={permissions.publishDirections}
            canEdit={permissions.editDirections}
            query={hub.directions}
          />
          <GroupOpportunities
            groupId={groupId}
            canManage={permissions.manageOpportunities}
            query={hub.opportunities}
          />
          {permissions.manageOpportunities ? (
            <GroupApplications groupId={groupId} query={hub.applications} />
          ) : null}
        </Stack>
      </Grid>
    </Stack>
  );
}

export function GroupHub({ groupId }: { groupId: string }) {
  return (
    <RequireAuth>
      <Container maxW="6xl" py={{ base: '4', md: '8' }}>
        <HubContent key={groupId} groupId={groupId} />
      </Container>
    </RequireAuth>
  );
}
