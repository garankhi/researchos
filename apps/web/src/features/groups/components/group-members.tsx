'use client';

import {
  Avatar,
  Badge,
  Box,
  Flex,
  Heading,
  Stack,
  Text,
} from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { EntityLink } from '@/features/discovery';
import {
  groupMembersControllerAdd,
  groupMembersControllerRemove,
  groupMembersControllerRestore,
  groupMembersControllerUpdate,
} from '@/lib/api';
import type { Member } from '../types';
import type { HubArchive } from '../hooks/use-group-hub';
import {
  HubAction,
  HubEditor,
  HubList,
  HubMenu,
  HubSection,
} from './hub-controls';

export function GroupMembers({
  groupId,
  leadId,
  active,
  canManage,
  query,
  archive,
}: {
  groupId: string;
  leadId: string;
  active: boolean;
  canManage: boolean;
  query: Parameters<typeof HubList<Member>>[0]['query'];
  archive?: HubArchive<Member>;
}) {
  const t = useTranslations('groups');
  const roles = (['MEMBER', 'GROUP_LEADER'] as const).map((value) => ({
    value,
    label: t(`roles.${value}`),
  }));
  return (
    <HubSection
      title={t('members')}
      archive={archive}
      action={
        canManage && !archive?.showing ? (
          <HubEditor
            groupId={groupId}
            label={t('addMember')}
            title={t('addMember')}
            fields={[
              {
                name: 'userId',
                label: t('userId'),
                type: 'uuid',
                required: true,
              },
              {
                name: 'role',
                label: t('role'),
                initial: 'MEMBER',
                options: roles,
              },
            ]}
            submit={(values) =>
              groupMembersControllerAdd(groupId, {
                userId: values.userId,
                role: values.role as Member['role'],
              })
            }
          />
        ) : null
      }
    >
      <HubList
        query={archive?.showing ? archive.query : query}
        archived={archive?.showing}
      >
        {(members) =>
          members.map((member, index) => (
            <Box
              key={member.userId}
              position="relative"
              borderBottomWidth={index < members.length - 1 ? '1px' : '0'}
              borderColor="border"
              pb={index < members.length - 1 ? '4' : '0'}
            >
              <Flex
                direction={{ base: 'column', sm: 'row' }}
                gap="4"
                align="start"
              >
                <Avatar.Root>
                  <Avatar.Fallback name={member.fullName} />
                </Avatar.Root>
                <Stack flex="1" minW="0" gap="2">
                  <Heading as="h3" size="sm" pe={canManage ? '8' : '0'}>
                    <EntityLink
                      entityType="RESEARCHER"
                      entityId={member.userId}
                      href={`/profile/${member.userId}`}
                    >
                      {member.fullName}
                    </EntityLink>
                  </Heading>
                  <Text textStyle="sm" color="fg.muted" overflowWrap="anywhere">
                    {member.email}
                  </Text>
                  {[
                    member.academicTitle,
                    member.academicDegree,
                    member.departmentUnit,
                  ]
                    .filter(Boolean)
                    .join(' · ') ? (
                    <Text textStyle="sm" color="fg.muted">
                      {[
                        member.academicTitle,
                        member.academicDegree,
                        member.departmentUnit,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  ) : null}
                  {member.bio ? (
                    <Text textStyle="sm" color="fg.muted" lineClamp={2}>
                      {member.bio}
                    </Text>
                  ) : null}
                  <Badge alignSelf="start" variant="subtle" colorPalette="gray">
                    {t(`roles.${member.role}`)}
                  </Badge>
                  {archive?.showing && canManage ? (
                    <HubMenu positioned>
                      <HubAction
                        groupId={groupId}
                        label={t('restoreMember')}
                        confirm
                        confirmationMessage={t('restoreMemberNotice')}
                        action={() =>
                          groupMembersControllerRestore(groupId, member.userId)
                        }
                      />
                    </HubMenu>
                  ) : canManage ? (
                    <HubMenu positioned>
                      <HubEditor
                        groupId={groupId}
                        label={t('changeRole')}
                        title={t('changeRole')}
                        fields={[
                          {
                            name: 'role',
                            label: t('role'),
                            initial: member.role,
                            options: roles,
                          },
                        ]}
                        submit={(values) =>
                          groupMembersControllerUpdate(groupId, member.userId, {
                            role: values.role as Member['role'],
                          })
                        }
                      />
                      <HubAction
                        groupId={groupId}
                        label={t('removeMember')}
                        confirm
                        danger
                        disabled={active && member.userId === leadId}
                        action={() =>
                          groupMembersControllerRemove(groupId, member.userId)
                        }
                      />
                    </HubMenu>
                  ) : null}
                </Stack>
              </Flex>
            </Box>
          ))
        }
      </HubList>
    </HubSection>
  );
}
