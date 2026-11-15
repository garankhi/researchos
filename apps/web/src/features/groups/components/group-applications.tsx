'use client';

import { Badge, Box, Heading, Link, Stack, Text } from '@chakra-ui/react';
import { useLocale, useTranslations } from 'next-intl';
import NextLink from '@/components/ui/link';
import { applicationsControllerRespond } from '@/lib/api';
import type { Application } from '../types';
import { HubEditor, HubList, HubSection } from './hub-controls';

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
          items.map((application) => (
            <Box key={application.id} borderWidth="1px" borderRadius="md" p="4">
              <Stack gap="3">
                <Heading as="h3" size="md">
                  {application.opportunityTitle ?? t('untitledOpportunity')}
                </Heading>
                <Link asChild>
                  <NextLink href={`/profile/${application.applicantId}`}>
                    {t('viewApplicant')}
                  </NextLink>
                </Link>
                <Badge alignSelf="start">
                  {t(`statuses.${application.status}`)}
                </Badge>
                <Text whiteSpace="pre-wrap">{application.applicantNote}</Text>
                {application.status === 'PENDING' ? (
                  <>
                    <Text
                      color={application.isOverdue ? 'fg.error' : 'fg.muted'}
                    >
                      {t(application.isOverdue ? 'overdue' : 'responseDue', {
                        date: new Date(
                          application.responseDueAt,
                        ).toLocaleString(locale),
                      })}
                    </Text>
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
                  </>
                ) : (
                  <Text whiteSpace="pre-wrap">{application.responseNote}</Text>
                )}
              </Stack>
            </Box>
          ))
        }
      </HubList>
    </HubSection>
  );
}
