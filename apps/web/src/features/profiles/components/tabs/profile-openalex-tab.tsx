'use client';

import { useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  Link,
  Stack,
  Text,
} from '@chakra-ui/react';
import { Check, ExternalLink, GraduationCap, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
} from '@/components/ui/feedback';
import { useOpenAlexCandidates } from '../../hooks/use-openalex-candidates';
import type { CandidateWorkDto } from '../../types';

export function ProfileOpenAlexTab() {
  const t = useTranslations('profile');
  const { showSnackbar } = useSnackbar();

  const {
    candidates,
    pendingCount,
    isLoading,
    isFailed,
    refetch,
    acceptWork,
    rejectWork,
  } = useOpenAlexCandidates();

  const [operatingId, setOperatingId] = useState<string | null>(null);
  const [operationType, setOperationType] = useState<
    'accept' | 'reject' | null
  >(null);

  const handleAccept = async (work: CandidateWorkDto) => {
    try {
      setOperatingId(work.id);
      setOperationType('accept');
      await acceptWork(work.id);
      showSnackbar({
        message: t('openalexTab.workAccepted'),
        severity: 'success',
      });
    } catch {
      showSnackbar({ message: t('updateError'), severity: 'error' });
    } finally {
      setOperatingId(null);
      setOperationType(null);
    }
  };

  const handleReject = async (work: CandidateWorkDto) => {
    try {
      setOperatingId(work.id);
      setOperationType('reject');
      await rejectWork(work.id);
      showSnackbar({
        message: t('openalexTab.workRejected'),
        severity: 'info',
      });
    } catch {
      showSnackbar({ message: t('updateError'), severity: 'error' });
    } finally {
      setOperatingId(null);
      setOperationType(null);
    }
  };

  if (isLoading) {
    return (
      <Stack gap="4" py="2">
        <LoadingSkeleton variant="rectangular" height={130} count={3} />
      </Stack>
    );
  }

  if (isFailed) {
    return <ErrorState title={t('loadError')} onRetry={refetch} />;
  }

  if (candidates.length === 0) {
    return (
      <EmptyState
        title={t('openalexTab.emptyTitle')}
        message={t('openalexTab.emptyMessage')}
      />
    );
  }

  return (
    <Stack gap="5" py="1">
      <Heading as="h3" size="sm" fontWeight="semibold">
        {t('openalexTab.title')} ({pendingCount})
      </Heading>

      <Stack gap="4">
        {candidates.map((work) => {
          const isCurrentOperating = operatingId === work.id;
          const isAccepting = isCurrentOperating && operationType === 'accept';
          const isRejecting = isCurrentOperating && operationType === 'reject';
          const authorsStr = work.authors?.join(', ');

          return (
            <Box
              key={work.id}
              bg="bg.panel"
              borderWidth="1px"
              borderRadius="lg"
              p="5"
            >
              <Flex
                direction={{ base: 'column', md: 'row' }}
                gap="4"
                justify="space-between"
                align={{ base: 'flex-start', md: 'center' }}
              >
                <Box flex="1" minW="0">
                  <Heading
                    as="h3"
                    size="sm"
                    fontWeight="semibold"
                    lineHeight="1.4"
                  >
                    {work.title}
                  </Heading>

                  {authorsStr ? (
                    <Text textStyle="sm" color="fg.muted" mt="1">
                      {authorsStr}
                    </Text>
                  ) : null}

                  <Flex mt="2" gap="3" align="center" flexWrap="wrap">
                    {work.venue ? (
                      <Text textStyle="sm" color="fg.muted" fontStyle="italic">
                        {work.venue}
                      </Text>
                    ) : null}

                    {work.publicationYear ? (
                      <Text textStyle="sm" color="fg.muted">
                        ({work.publicationYear})
                      </Text>
                    ) : null}

                    {work.outputType ? (
                      <Badge variant="outline" colorPalette="gray">
                        {work.outputType}
                      </Badge>
                    ) : null}

                    {work.doi ? (
                      <Link
                        href={`https://doi.org/${work.doi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        display="inline-flex"
                        alignItems="center"
                        gap="1"
                        textStyle="xs"
                      >
                        {`DOI: ${work.doi}`}
                        <ExternalLink />
                      </Link>
                    ) : null}

                    {work.openalexId ? (
                      <Link
                        href={work.openalexId}
                        target="_blank"
                        rel="noopener noreferrer"
                        display="inline-flex"
                        alignItems="center"
                        gap="1"
                        textStyle="xs"
                      >
                        <GraduationCap />
                        OpenAlex
                        <ExternalLink />
                      </Link>
                    ) : null}
                  </Flex>

                  {work.abstract ? (
                    <Text
                      textStyle="sm"
                      color="fg.muted"
                      mt="3"
                      lineClamp={2}
                      lineHeight="1.5"
                    >
                      {work.abstract}
                    </Text>
                  ) : null}
                </Box>

                <Flex
                  gap="3"
                  alignSelf={{ base: 'stretch', md: 'center' }}
                  justify={{ base: 'flex-end', md: 'flex-start' }}
                >
                  <Button
                    variant="outline"
                    colorPalette="red"
                    size="sm"
                    onClick={() => handleReject(work)}
                    disabled={isCurrentOperating}
                    loading={isRejecting}
                  >
                    <X />
                    {t('openalexTab.reject')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleAccept(work)}
                    disabled={isCurrentOperating}
                    loading={isAccepting}
                  >
                    <Check />
                    {t('openalexTab.accept')}
                  </Button>
                </Flex>
              </Flex>
            </Box>
          );
        })}
      </Stack>
    </Stack>
  );
}
