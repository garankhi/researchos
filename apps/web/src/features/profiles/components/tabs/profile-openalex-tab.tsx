'use client';

import { useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  Icon,
  Link,
  Stack,
  Text,
} from '@chakra-ui/react';
import { BookOpen, Check, ExternalLink, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { useOpenAlexCandidates } from '../../hooks/use-openalex-candidates';
import type { CandidateWorkDto } from '../../types';
import { ProfileTabSkeleton } from '../profile-skeletons';

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
  const [actionError, setActionError] = useState<string | null>(null);

  const handleAccept = async (work: CandidateWorkDto) => {
    setActionError(null);
    try {
      setOperatingId(work.id);
      setOperationType('accept');
      await acceptWork(work.id);
      showSnackbar({
        message: t('openalexTab.workAccepted'),
        severity: 'success',
      });
    } catch {
      setActionError(t('updateError'));
    } finally {
      setOperatingId(null);
      setOperationType(null);
    }
  };

  const handleReject = async (work: CandidateWorkDto) => {
    setActionError(null);
    try {
      setOperatingId(work.id);
      setOperationType('reject');
      await rejectWork(work.id);
      showSnackbar({
        message: t('openalexTab.workRejected'),
        severity: 'info',
      });
    } catch {
      setActionError(t('updateError'));
    } finally {
      setOperatingId(null);
      setOperationType(null);
    }
  };

  if (isLoading) {
    return (
      <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '6' }}>
        <ProfileTabSkeleton tab="openalex" />
      </Box>
    );
  }

  if (isFailed) {
    return (
      <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '6' }}>
        <ErrorState title={t('loadError')} onRetry={refetch} />
      </Box>
    );
  }

  if (candidates.length === 0) {
    return (
      <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '6' }}>
        <EmptyState
          title={t('openalexTab.emptyTitle')}
          message={t('openalexTab.emptyMessage')}
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
          {t('openalexTab.title')} ({pendingCount})
        </Heading>
        <Text textStyle="sm" color="fg.muted" mt="1">
          {t('openalexTab.description')}
        </Text>
      </Box>

      {actionError ? (
        <Box px={{ base: '4', md: '6' }} pt="4">
          <ErrorState title={t('updateError')} message={actionError} />
        </Box>
      ) : null}

      <Box>
        {candidates.map((work, idx) => {
          const isCurrentOperating = operatingId === work.id;
          const isAccepting = isCurrentOperating && operationType === 'accept';
          const isRejecting = isCurrentOperating && operationType === 'reject';
          const authorsStr = work.authors?.join(', ');

          return (
            <Box
              key={work.id}
              py="5"
              px={{ base: '4', md: '6' }}
              borderBottomWidth={idx < candidates.length - 1 ? '1px' : '0'}
              borderColor="border"
            >
              <Stack gap="2.5">
                <Flex gap="2" align="center" flexWrap="wrap">
                  {work.outputType ? (
                    <Badge colorPalette="blue">{work.outputType}</Badge>
                  ) : null}
                  {work.publicationYear ? (
                    <Text textStyle="sm" color="fg.muted">
                      {work.publicationYear}
                    </Text>
                  ) : null}
                </Flex>

                <Heading as="h3" size="md" fontWeight="bold" lineHeight="1.35">
                  {work.title}
                </Heading>

                {work.venue ? (
                  <Flex align="center" gap="2" textStyle="sm" color="fg.muted">
                    <Icon
                      as={BookOpen}
                      boxSize="4"
                      flexShrink={0}
                      aria-hidden
                    />
                    <Text fontStyle="italic">{work.venue}</Text>
                  </Flex>
                ) : null}

                {authorsStr ? (
                  <Text textStyle="sm" color="fg.muted">
                    {authorsStr}
                  </Text>
                ) : null}

                {work.abstract ? (
                  <Text
                    textStyle="sm"
                    color="fg.muted"
                    lineClamp={2}
                    lineHeight="1.55"
                  >
                    {work.abstract}
                  </Text>
                ) : null}

                <Flex
                  pt="2"
                  gap="3"
                  align="center"
                  justify="space-between"
                  flexWrap="wrap"
                >
                  <Flex gap="3" align="center" wrap="wrap">
                    {work.doi ? (
                      <Link
                        href={`https://doi.org/${work.doi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        display="inline-flex"
                        alignItems="center"
                        gap="1"
                        textStyle="xs"
                        color="fg.muted"
                        layerStyle="researchTextLink"
                      >
                        {`DOI: ${work.doi}`}
                        <Icon as={ExternalLink} boxSize="3" aria-hidden />
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
                        color="fg.muted"
                        layerStyle="researchTextLink"
                      >
                        OpenAlex
                        <Icon as={ExternalLink} boxSize="3" aria-hidden />
                      </Link>
                    ) : null}
                  </Flex>

                  <Flex gap="2">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => void handleReject(work)}
                      disabled={isCurrentOperating}
                      loading={isRejecting}
                    >
                      <X />
                      {t('openalexTab.reject')}
                    </Button>
                    <Button
                      size="xs"
                      onClick={() => void handleAccept(work)}
                      disabled={isCurrentOperating}
                      loading={isAccepting}
                    >
                      <Check />
                      {t('openalexTab.accept')}
                    </Button>
                  </Flex>
                </Flex>
              </Stack>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
