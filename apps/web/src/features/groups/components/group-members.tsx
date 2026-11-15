'use client';

import {
  Avatar,
  Badge,
  Box,
  Heading,
  Link,
  Stack,
  Text,
} from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import NextLink from '@/components/ui/link';
import {
  groupMembersControllerAdd,
  groupMembersControllerRemove,
  groupMembersControllerUpdate,
} from '@/lib/api';
import type { Member } from '../types';
import { HubAction, HubEditor, HubList, HubSection } from './hub-controls';

export function GroupMembers({
  groupId,
  leadId,
  active,
  canManage,
  query,
}: {
  groupId: string;
  leadId: string;
  active: boolean;
  canManage: boolean;
  query: Parameters<typeof HubList<Member>>[0]['query'];
}) {
  const t = useTranslations('groups');
  const roles = (['MEMBER', 'GROUP_LEADER'] as const).map((value) => ({
    value,
    label: t(`roles.${value}`),
  }));
  return (
    <HubSection title={t('members')}>
      {canManage ? (
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
      ) : null}
      <HubList query={query}>
        {(members) =>
          members.map((member) => (
            <Box key={member.userId} borderWidth="1px" borderRadius="md" p="4">
              <Stack
                direction={{ base: 'column', sm: 'row' }}
                gap="4"
                align="start"
              >
                <Avatar.Root>
                  <Avatar.Fallback name={member.fullName} />
                </Avatar.Root>
                <Stack flex="1" minW="0" gap="2">
                  <Heading as="h3" size="sm">
                    <Link asChild>
                      <NextLink href={`/profile/${member.userId}`}>
                        {member.fullName}
                      </NextLink>
                    </Link>
                  </Heading>
                  <Text overflowWrap="anywhere">{member.email}</Text>
                  <Text color="fg.muted">
                    {[
                      member.academicTitle,
                      member.academicDegree,
                      member.departmentUnit,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  {member.bio ? (
                    <Text whiteSpace="pre-wrap">{member.bio}</Text>
                  ) : null}
                  <Badge alignSelf="start">{t(`roles.${member.role}`)}</Badge>
                  {canManage ? (
                    <Stack gap="3">
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
                        disabled={active && member.userId === leadId}
                        action={() =>
                          groupMembersControllerRemove(groupId, member.userId)
                        }
                      />
                    </Stack>
                  ) : null}
                </Stack>
              </Stack>
            </Box>
          ))
        }
      </HubList>
    </HubSection>
  );
}
