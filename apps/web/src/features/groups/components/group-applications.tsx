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
          items.map((application, index) => (
            <Box
              key={application.id}
              position="relative"
              borderBottomWidth={index < items.length - 1 ? '1px' : '0'}
              borderColor="border"
              pb={index < items.length - 1 ? '4' : '0'}
            >
              <Stack gap="3">
                <Heading as="h3" size="md" pe="8">
                  {application.opportunityId ? (
                    <Link asChild color="fg">
                      <NextLink
                        href={`/opportunities/${application.opportunityId}`}
                      >
                        {application.opportunityTitle ??
                          t('untitledOpportunity')}
                      </NextLink>
                    </Link>
                  ) : (
                    (application.opportunityTitle ?? t('untitledOpportunity'))
                  )}
                </Heading>
                <Flex gap="3" align="flex-start" minW="0">
                  <Avatar.Root size="sm" flexShrink={0}>
                    <Avatar.Fallback
                      name={
                        application.applicantFullName || t('unknownApplicant')
                      }
                    />
                  </Avatar.Root>
                  <Stack gap="1" minW="0">
                    <Link
                      asChild
                      layerStyle="researchTextLink"
                      textStyle="sm"
                      fontWeight="semibold"
                    >
                      <NextLink href={`/profile/${application.applicantId}`}>
                        {application.applicantFullName || t('unknownApplicant')}
                      </NextLink>
                    </Link>
                    {application.applicantDepartmentUnit ? (
                      <Text textStyle="xs" color="fg.muted">
                        {application.applicantDepartmentUnit}
                      </Text>
                    ) : null}
                    {application.applicantEmail ? (
                      <Text
                        textStyle="xs"
                        color="fg.muted"
                        overflowWrap="anywhere"
                      >
                        {application.applicantEmail}
                      </Text>
                    ) : null}
                  </Stack>
                </Flex>
                <Badge
                  alignSelf="start"
                  variant="subtle"
                  colorPalette={
                    application.status === 'PENDING'
                      ? 'orange'
                      : application.status === 'INVITED_TO_DISCUSS'
                        ? 'green'
                        : 'gray'
                  }
                >
                  {t(`statuses.${application.status}`)}
                </Badge>
                {application.applicantNote ? (
                  <Text textStyle="sm" color="fg.muted" lineClamp={3}>
                    {application.applicantNote}
                  </Text>
                ) : null}
                {application.status === 'PENDING' ? (
                  <>
                    <Text
                      textStyle="sm"
                      color={application.isOverdue ? 'fg.error' : 'fg.muted'}
                    >
                      {t(application.isOverdue ? 'overdue' : 'responseDue', {
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
                    </HubMenu>
                  </>
                ) : application.responseNote ? (
                  <Text textStyle="sm" color="fg.muted">
                    {application.responseNote}
                  </Text>
                ) : null}
              </Stack>
            </Box>
          ))
        }
      </HubList>
    </HubSection>
  );
}
