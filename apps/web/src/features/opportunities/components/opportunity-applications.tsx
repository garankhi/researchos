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
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { OpportunityApplicationsSkeleton } from './opportunity-skeletons';
import type { Application } from '../types';
import { EntityLink } from '@/features/discovery';

/**
 * The badge colour of an application status.
 */
function statusPalette(status: Application['status']) {
  switch (status) {
    case 'PENDING':
      return 'orange' as const;
    case 'INVITED_TO_DISCUSS':
      return 'green' as const;
    case 'DECLINED':
      return 'red' as const;
    default:
      return 'gray' as const;
  }
}

/**
 * The applications one opportunity received.
 *
 * Each row shows who applied — avatar, name, department and email — and
 * the name links to the applicant's profile. The display fields arrive
 * with the application, so the list costs one request rather than one
 * per applicant.
 */
export function OpportunityApplications({
  applications,
  isLoading,
  isFailed,
  onRetry,
}: {
  applications: Application[];
  isLoading: boolean;
  isFailed: boolean;
  onRetry: () => void;
}) {
  const t = useTranslations('opportunities');

  if (isFailed) {
    return (
      <Box bg="bg.panel" boxShadow="xs">
        <Box p={{ base: '4', md: '6' }}>
          <ErrorState title={t('applicationsLoadError')} onRetry={onRetry} />
        </Box>
      </Box>
    );
  }

  if (isLoading) {
    return <OpportunityApplicationsSkeleton />;
  }

  if (applications.length === 0) {
    return (
      <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '6' }}>
        <EmptyState
          title={t('applicationsEmptyTitle')}
          message={t('applicationsEmptyMessage')}
        />
      </Box>
    );
  }

  return (
    <Box bg="bg.panel" boxShadow="xs">
      <Box
        px={{ base: '4', md: '6' }}
        py="4"
        borderBottomWidth="1px"
        borderColor="border"
      >
        <Heading as="h2" size="md" fontWeight="bold">
          {t('applicationsTitle')} ({applications.length})
        </Heading>
      </Box>

      <Box>
        {applications.map((application, index) => {
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
              py="4"
              px={{ base: '4', md: '6' }}
              borderBottomWidth={index < applications.length - 1 ? '1px' : '0'}
              borderColor="border"
            >
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
                      {t(`applicationStatuses.${application.status}`)}
                    </Badge>

                    {application.isOverdue &&
                    application.status === 'PENDING' ? (
                      <Text textStyle="xs" color="fg.error">
                        {t('overdue')}
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
                        {t('responseNoteLabel')}
                      </Text>
                      <Text textStyle="sm" mt="0.5">
                        {application.responseNote}
                      </Text>
                    </Box>
                  ) : null}
                </Stack>
              </Flex>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
