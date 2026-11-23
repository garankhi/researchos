'use client';

import {
  Avatar,
  Badge,
  Box,
  Flex,
  Heading,
  Link,
  Stack,
  Text,
} from '@chakra-ui/react';
import { useLocale, useTranslations } from 'next-intl';
import NextLink from '@/components/ui/link';
import { applicationsControllerRespond } from '@/lib/api';
import type { Application } from '../types';
import { HubEditor, HubList, HubMenu, HubSection } from './hub-controls';
import { EntityLink } from '@/features/discovery';

/**
 * The badge colour of an application status.
 */
function statusPalette(status: Application['status']) {
  switch (status) {
    case 'PENDING':
      return 'orange' as const;
    case 'ACCEPTED':
      return 'green' as const;
    case 'INVITED_TO_DISCUSS':
      return 'blue' as const;
    case 'DECLINED':
      return 'red' as const;
    default:
      return 'gray' as const;
  }
}

/**
 * The applications one group received.
 *
 * The row matches the application list on an opportunity: the applicant
 * leads — avatar, name, department and email — and the name links to
 * their profile. The opportunity the application targets sits above,
 * because a group sees applications from several opportunities.
 */
export function GroupApplications({
  groupId,
  query,
}: {
  groupId: string;
  query: Parameters<typeof HubList<Application>>[0]['query'];
}) {
  const t = useTranslations('groups');
  const locale = useLocale();
  return (
    <HubSection title={t('applications')}>
      <HubList query={query}>
        {(items) =>
          items.map((application, index) => {
            const name = application.applicantFullName || t('unknownApplicant');

            const applicantMeta = [
              application.applicantDepartmentUnit,
              application.applicantEmail,
            ]
              .filter(Boolean)
              .join(' · ');

            return (
              <Box
                key={application.id}
                position="relative"
                borderBottomWidth={index < items.length - 1 ? '1px' : '0'}
                borderColor="border"
                pb={index < items.length - 1 ? '4' : '0'}
              >
                <Stack gap="2.5">
                  {application.opportunityId ? (
                    <Heading as="h3" size="sm" fontWeight="bold" pe="8">
                      <Link asChild color="fg">
                        <NextLink
                          href={`/opportunities/${application.opportunityId}`}
                        >
                          {application.opportunityTitle ??
                            t('untitledOpportunity')}
                        </NextLink>
                      </Link>
                    </Heading>
                  ) : null}

                  <Flex gap="4" align="flex-start" minW="0">
                    <Avatar.Root size="md" flexShrink={0}>
                      <Avatar.Fallback name={name} />
                    </Avatar.Root>

                    <Stack gap="2.5" flex="1" minW="0">
                      <Stack gap="0.5">
                        <Heading
                          as="h3"
                          size="sm"
                          fontWeight="bold"
                          lineHeight="1.4"
                        >
                          <EntityLink
                            entityType="RESEARCHER"
                            entityId={application.applicantId}
                            href={`/profile/${application.applicantId}`}
                          >
                            {name}
                          </EntityLink>
                        </Heading>

                        {applicantMeta ? (
                          <Text
                            textStyle="sm"
                            color="fg.muted"
                            overflowWrap="anywhere"
                          >
                            {applicantMeta}
                          </Text>
                        ) : null}
                      </Stack>

                      <Flex gap="2.5" align="center" flexWrap="wrap">
                        <Badge
                          variant="subtle"
                          colorPalette={statusPalette(application.status)}
                        >
                          {t(`statuses.${application.status}`)}
                        </Badge>

                        {application.isOverdue &&
                        application.status === 'PENDING' ? (
                          <Text textStyle="xs" color="fg.error">
                            {t('overdue', {
                              date: new Date(
                                application.responseDueAt,
                              ).toLocaleString(locale),
                            })}
                          </Text>
                        ) : null}
                      </Flex>

                      {application.applicantNote ? (
                        <Text
                          textStyle="sm"
                          color="fg.muted"
                          whiteSpace="pre-line"
                          lineHeight="1.55"
                        >
                          {application.applicantNote}
                        </Text>
                      ) : null}

                      {application.responseNote ? (
                        <Box
                          p="3"
                          bg="bg.muted"
                          borderLeftWidth="2px"
                          borderColor="blue.solid"
                        >
                          <Text
                            textStyle="xs"
                            color="fg.muted"
                            fontWeight="semibold"
                          >
                            {t('responseNote')}
                          </Text>
                          <Text textStyle="sm" mt="0.5">
                            {application.responseNote}
                          </Text>
                        </Box>
                      ) : null}
                    </Stack>
                  </Flex>

                  {application.status === 'PENDING' ? (
                    <Flex justify="flex-end" align="center" gap="2">
                      <Text
                        textStyle="sm"
                        color={application.isOverdue ? 'fg.error' : 'fg.muted'}
                      >
                        {t('responseDue', {
                          date: new Date(
                            application.responseDueAt,
                          ).toLocaleString(locale),
                        })}
                      </Text>
                      <HubMenu positioned>
                        <HubEditor
                          groupId={groupId}
                          label={t('respond')}
                          title={t('respond')}
                          fields={[
                            {
                              name: 'decision',
                              label: t('decision'),
                              initial: 'INVITED_TO_DISCUSS',
                              options: (
                                ['INVITED_TO_DISCUSS', 'DECLINED'] as const
                              ).map((value) => ({
                                value,
                                label: t(`statuses.${value}`),
                              })),
                            },
                            {
                              name: 'responseNote',
                              label: t('responseNote'),
                              type: 'textarea',
                              max: 10000,
                            },
                          ]}
                          submit={(values) =>
                            applicationsControllerRespond(application.id, {
                              decision: values.decision as
                                'INVITED_TO_DISCUSS' | 'DECLINED',
                              responseNote: values.responseNote || null,
                            })
                          }
                        />
                        <HubEditor
                          groupId={groupId}
                          label={t('acceptApplication')}
                          title={t('acceptApplication')}
                          submitLabel={t('acceptApplication')}
                          fields={[
                            {
                              name: 'responseNote',
                              label: t('responseNote'),
                              type: 'textarea',
                              max: 10000,
                            },
                          ]}
                          submit={(values) =>
                            applicationsControllerRespond(application.id, {
                              decision: 'ACCEPTED',
                              responseNote: values.responseNote || null,
                            })
                          }
                        >
                          <Text>{t('acceptMembershipConfirmation')}</Text>
                        </HubEditor>
                      </HubMenu>
                    </Flex>
                  ) : null}
                </Stack>
              </Box>
            );
          })
        }
      </HubList>
    </HubSection>
  );
}
