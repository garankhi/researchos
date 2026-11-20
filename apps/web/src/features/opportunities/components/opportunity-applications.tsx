'use client';

import { Badge, Box, Flex, Heading, Link, Stack, Text } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import NextLink from '@/components/ui/link';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import type { Application } from '../types';

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
 * Only a manager of the opportunity sees this, and it links to each
 * applicant's profile so the applicant can be read in context.
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
    return (
      <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '6' }}>
        <Text textStyle="sm" color="fg.muted">
          {t('applicationsLoading')}
        </Text>
      </Box>
    );
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
        {applications.map((application, index) => (
          <Box
            key={application.id}
            py="4"
            px={{ base: '4', md: '6' }}
            borderBottomWidth={index < applications.length - 1 ? '1px' : '0'}
            borderColor="border"
          >
            <Flex
              direction={{ base: 'column', sm: 'row' }}
              gap="4"
              justify="space-between"
              align={{ base: 'flex-start', sm: 'flex-start' }}
            >
              <Stack gap="2" flex="1" minW="0">
                <Link
                  asChild
                  textStyle="sm"
                  fontWeight="semibold"
                  layerStyle="researchTextLink"
                  display="block"
                >
                  <NextLink href={`/profile/${application.applicantId}`}>
                    {t('viewApplicant')}
                  </NextLink>
                </Link>

                <Flex gap="2.5" align="center" flexWrap="wrap">
                  <Badge
                    variant="subtle"
                    colorPalette={statusPalette(application.status)}
                  >
                    {t(`applicationStatuses.${application.status}`)}
                  </Badge>

                  {application.isOverdue && application.status === 'PENDING' ? (
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
                    <Text textStyle="xs" color="fg.muted" fontWeight="semibold">
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
        ))}
      </Box>
    </Box>
  );
}
