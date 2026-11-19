'use client';

import { useState } from 'react';
import {
  Badge,
  Box,
  Container,
  Flex,
  Grid,
  Stack,
  Tabs,
} from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { groupsControllerUpdate } from '@/lib/api';
import { useGroupHub } from '../hooks/use-group-hub';
import type { GroupTab } from '../types';
import { GroupApplications } from './group-applications';
import { GroupDirections } from './group-directions';
import { GroupHeader } from './group-header';
import { GroupMembers } from './group-members';
import { GroupOpportunities } from './group-opportunities';
import { GroupOutputs } from './group-outputs';
import { GroupSidebar } from './group-sidebar';
import { HubAction, HubEditor, HubMenu } from './hub-controls';

/**
 * The group's workspace.
 *
 * The layout follows the profile and output detail pages: a full-bleed
 * white banner carrying the group name and the tab strip, then a
 * two-column grid on the `#f6f6f6` canvas — the main column on the
 * left, a summary sidebar on the right.
 */
export function GroupShell({
  groupId,
  group,
  permissions,
  hub,
}: {
  groupId: string;
  group: NonNullable<ReturnType<typeof useGroupHub>['group']['data']>;
  permissions: NonNullable<
    ReturnType<typeof useGroupHub>['permissions']
  >;
  hub: ReturnType<typeof useGroupHub>;
}) {
  const t = useTranslations('groups');
  const [activeTab, setActiveTab] = useState<GroupTab>('outputs');

  const active = group.isActive && !group.archivedAt;
  const isLeader = group.callerMembershipRole === 'GROUP_LEADER';
  const members = hub.members.data ?? [];

  return (
    <Tabs.Root
      as="main"
      flex="1"
      bg="home.background"
      variant="line"
      colorPalette="blue"
      value={activeTab}
      onValueChange={(details) => setActiveTab(details.value as GroupTab)}
    >
      {/* Full-bleed white ResearchGate-style group hero banner */}
      <Box bg="bg.panel" borderBottomWidth="1px" borderColor="border">
        <Container
          maxW="64rem"
          px={{ base: '4', md: '6' }}
          pt={{ base: '5', md: '8' }}
        >
          <Stack gap="5" minW="0">
            <Flex
              direction={{ base: 'column', md: 'row' }}
              gap="4"
              align={{ base: 'stretch', md: 'flex-start' }}
              justify="space-between"
            >
              <GroupHeader
                group={group}
                memberCount={members.length}
                isLeader={isLeader}
                active={active}
              />

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
            </Flex>

            <Tabs.List
              gap={{ base: '4', md: '7' }}
              borderBottomWidth="0"
              flexWrap="wrap"
            >
              <Tabs.Trigger value="outputs" height="12" px="0">
                {t('outputs')}
                {hub.outputs.data && hub.outputs.data.length > 0 ? (
                  <Badge variant="subtle" colorPalette="gray">
                    {hub.outputs.data.length}
                  </Badge>
                ) : null}
              </Tabs.Trigger>

              <Tabs.Trigger value="members" height="12" px="0">
                {t('members')}
                {members.length > 0 ? (
                  <Badge variant="subtle" colorPalette="gray">
                    {members.length}
                  </Badge>
                ) : null}
              </Tabs.Trigger>

              <Tabs.Trigger value="directions" height="12" px="0">
                {t('directions')}
                {hub.directions.data && hub.directions.data.length > 0 ? (
                  <Badge variant="subtle" colorPalette="gray">
                    {hub.directions.data.length}
                  </Badge>
                ) : null}
              </Tabs.Trigger>

              <Tabs.Trigger value="opportunities" height="12" px="0">
                {t('opportunities')}
                {hub.opportunities.data && hub.opportunities.data.length > 0 ? (
                  <Badge variant="subtle" colorPalette="gray">
                    {hub.opportunities.data.length}
                  </Badge>
                ) : null}
              </Tabs.Trigger>

              {permissions.manageOpportunities ? (
                <Tabs.Trigger value="applications" height="12" px="0">
                  {t('applications')}
                  {hub.applications.data &&
                  hub.applications.data.length > 0 ? (
                    <Badge colorPalette="blue">
                      {hub.applications.data.length}
                    </Badge>
                  ) : null}
                </Tabs.Trigger>
              ) : null}
            </Tabs.List>
          </Stack>
        </Container>
      </Box>

      {/* Two-column ResearchGate academic content area on #f6f6f6 canvas */}
      <Container
        maxW="64rem"
        px={{ base: '4', md: '6' }}
        py={{ base: '4', lg: '6' }}
      >
        <Grid
          templateColumns={{
            base: 'minmax(0, 1fr)',
            lg: 'minmax(0, 1.95fr) minmax(0, 1fr)',
          }}
          alignItems="start"
          gap="4"
        >
          <Box minW="0">
            <Tabs.Content value="outputs" pt="0">
              <GroupOutputs
                groupId={groupId}
                canManage={permissions.manageOutputs}
                query={hub.outputs}
                pendingQuery={hub.pendingOutputs}
              />
            </Tabs.Content>

            <Tabs.Content value="members" pt="0">
              <GroupMembers
                groupId={groupId}
                leadId={group.leadId}
                active={active}
                canManage={permissions.manageMembers}
                query={hub.members}
              />
            </Tabs.Content>

            <Tabs.Content value="directions" pt="0">
              <GroupDirections
                groupId={groupId}
                canPublish={permissions.publishDirections}
                canEdit={permissions.editDirections}
                query={hub.directions}
              />
            </Tabs.Content>

            <Tabs.Content value="opportunities" pt="0">
              <GroupOpportunities
                groupId={groupId}
                canManage={permissions.manageOpportunities}
                query={hub.opportunities}
              />
            </Tabs.Content>

            {permissions.manageOpportunities ? (
              <Tabs.Content value="applications" pt="0">
                <GroupApplications
                  groupId={groupId}
                  query={hub.applications}
                />
              </Tabs.Content>
            ) : null}
          </Box>

          <GroupSidebar
            group={group}
            members={members}
            directions={hub.directions.data ?? []}
            opportunities={hub.opportunities.data ?? []}
            isLeader={isLeader}
            active={active}
            onSelectTab={setActiveTab}
          />
        </Grid>
      </Container>
    </Tabs.Root>
  );
}
