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
  RadioGroup,
  Stack,
  Text,
} from '@chakra-ui/react';
import { BookOpen, Check, Download, ExternalLink, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { doiUrl } from '@/lib/doi-url';
import { apiErrorCode } from '@/lib/api-error';
import { resolveErrorCode } from '@/utils/error-messages';
import { useOpenAlexCandidates } from '../../hooks/use-openalex-candidates';
import type { CandidateWorkDto } from '../../types';
import { ProfileTabSkeleton } from '../profile-skeletons';

/**
 * The OpenAlex tab of a profile.
 *
 * Two lists, one pull button:
 *
 * - **Pending** — the candidates awaiting a decision;
 * - **Rejected** — the works the researcher rejected. A rejection is
 *   never a deletion, so every one of them can still be accepted from
 *   here.
 *
 * Accepting asks one question: who may see the work. The default is the
 * researcher's own private copy, and the community is the other choice.
 */
export function ProfileOpenAlexTab() {
  const t = useTranslations('profile');
  const tErrors = useTranslations('errors');
  const { showSnackbar } = useSnackbar();

  const [subTab, setSubTab] = useState<'pending' | 'rejected'>('pending');
  const [pendingPage, setPendingPage] = useState(1);
  const [rejectedPage, setRejectedPage] = useState(1);

  const {
    candidates,
    rejected,
    pendingTotal,
    rejectedCount,
    isLoading,
    isFailed,
    refetch,
    acceptWork,
    rejectWork,
    pullWorks,
    isPulling,
  } = useOpenAlexCandidates({
    page: pendingPage,
    rejectedPage,
  });

  const [operatingId, setOperatingId] = useState<string | null>(null);
  const [operationType, setOperationType] = useState<
    'accept' | 'reject' | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [acceptingWork, setAcceptingWork] = useState<CandidateWorkDto | null>(
    null,
  );
  const [visibility, setVisibility] = useState<'PRIVATE' | 'FPTU_COMMUNITY'>(
    'PRIVATE',
  );

  const handleAccept = async (work: CandidateWorkDto) => {
    setActionError(null);
    try {
      setOperatingId(work.id);
      setOperationType('accept');
      await acceptWork(work.id, { visibility });
      setAcceptingWork(null);
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

  const handlePull = async () => {
    setActionError(null);
    try {
      const result = await pullWorks();
      showSnackbar({
        message: t('openalexTab.pullDone', {
          created: result.candidatesCreated ?? 0,
          existing: result.candidatesExisting ?? 0,
        }),
        severity: 'success',
      });
    } catch (error) {
      // The server answers with a code — `openalex_author_not_found`
      // when OpenAlex holds no work for this researcher. The code is
      // resolved through the catalog, so the message is the reason and
      // not a generic failure.
      setActionError(
        resolveErrorCode(
          tErrors,
          apiErrorCode(error),
          t('openalexTab.pullFailed'),
        ),
      );
    }
  };

  const openAccept = (work: CandidateWorkDto) => {
    setVisibility('PRIVATE');
    setAcceptingWork(work);
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

  const list = subTab === 'pending' ? candidates : rejected;

  return (
    <Box bg="bg.panel" boxShadow="xs">
      <Box
        px={{ base: '4', md: '6' }}
        py="4"
        borderBottomWidth="1px"
        borderColor="border"
      >
        <Flex
          align={{ base: 'flex-start', md: 'center' }}
          justify="space-between"
          gap="3"
          flexWrap="wrap"
        >
          <Box>
            <Heading as="h2" size="md" fontWeight="bold">
              {t('openalexTab.title')}
            </Heading>
            <Text textStyle="sm" color="fg.muted" mt="1">
              {t('openalexTab.description')}
            </Text>
          </Box>

          <Button
            size="sm"
            variant="outline"
            onClick={() => void handlePull()}
            loading={isPulling}
          >
            <Download />
            {t('openalexTab.fetchNew')}
          </Button>
        </Flex>
      </Box>

      <Flex
        px={{ base: '4', md: '6' }}
        pt="4"
        gap="2"
        role="tablist"
        aria-label={t('openalexTab.title')}
      >
        <Button
          role="tab"
          size="xs"
          variant={subTab === 'pending' ? 'solid' : 'ghost'}
          aria-selected={subTab === 'pending'}
          onClick={() => setSubTab('pending')}
        >
          {t('openalexTab.pendingTab')} ({pendingTotal})
        </Button>
        <Button
          role="tab"
          size="xs"
          variant={subTab === 'rejected' ? 'solid' : 'ghost'}
          aria-selected={subTab === 'rejected'}
          onClick={() => setSubTab('rejected')}
        >
          {t('openalexTab.rejectedTab')} ({rejectedCount})
        </Button>
      </Flex>

      {actionError ? (
        <Box px={{ base: '4', md: '6' }} pt="4">
          <ErrorState title={t('updateError')} message={actionError} />
        </Box>
      ) : null}

      {list.length === 0 ? (
        <Box p={{ base: '4', md: '6' }}>
          <EmptyState
            title={
              subTab === 'pending'
                ? t('openalexTab.emptyTitle')
                : t('openalexTab.emptyRejectedTitle')
            }
            message={
              subTab === 'pending'
                ? t('openalexTab.emptyMessage')
                : t('openalexTab.emptyRejectedMessage')
            }
          />
        </Box>
      ) : (
        <Box>
          {list.map((work, idx) => {
            const isCurrentOperating = operatingId === work.id;
            const isAccepting =
              isCurrentOperating && operationType === 'accept';
            const isRejecting =
              isCurrentOperating && operationType === 'reject';
            const authorsStr = work.authors?.join(', ');

            return (
              <Box
                key={work.id}
                py="5"
                px={{ base: '4', md: '6' }}
                borderBottomWidth={idx < list.length - 1 ? '1px' : '0'}
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

                  <Heading
                    as="h3"
                    size="md"
                    fontWeight="bold"
                    lineHeight="1.35"
                  >
                    {work.title}
                  </Heading>

                  {work.venue ? (
                    <Flex
                      align="center"
                      gap="2"
                      textStyle="sm"
                      color="fg.muted"
                    >
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
                          href={doiUrl(work.doi)}
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
                      {subTab === 'pending' ? (
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
                      ) : null}
                      <Button
                        size="xs"
                        onClick={() => openAccept(work)}
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
      )}

      {subTab === 'pending' && pendingTotal > list.length ? (
        <Flex
          px={{ base: '4', md: '6' }}
          py="4"
          gap="2"
          justify="center"
          align="center"
        >
          <Button
            size="xs"
            variant="outline"
            disabled={pendingPage <= 1}
            onClick={() => setPendingPage((p) => Math.max(1, p - 1))}
          >
            {t('openalexTab.previous')}
          </Button>
          <Text textStyle="sm" color="fg.muted">
            {t('openalexTab.page', { page: pendingPage })}
          </Text>
          <Button
            size="xs"
            variant="outline"
            disabled={pendingPage * 20 >= pendingTotal}
            onClick={() => setPendingPage((p) => p + 1)}
          >
            {t('openalexTab.next')}
          </Button>
        </Flex>
      ) : null}

      {subTab === 'rejected' && rejectedCount > list.length ? (
        <Flex
          px={{ base: '4', md: '6' }}
          py="4"
          gap="2"
          justify="center"
          align="center"
        >
          <Button
            size="xs"
            variant="outline"
            disabled={rejectedPage <= 1}
            onClick={() => setRejectedPage((p) => Math.max(1, p - 1))}
          >
            {t('openalexTab.previous')}
          </Button>
          <Text textStyle="sm" color="fg.muted">
            {t('openalexTab.page', { page: rejectedPage })}
          </Text>
          <Button
            size="xs"
            variant="outline"
            disabled={rejectedPage * 20 >= rejectedCount}
            onClick={() => setRejectedPage((p) => p + 1)}
          >
            {t('openalexTab.next')}
          </Button>
        </Flex>
      ) : null}

      {acceptingWork ? (
        <ConfirmationModal
          open
          onClose={() => setAcceptingWork(null)}
          title={t('openalexTab.acceptTitle')}
          description={t('openalexTab.acceptDescription')}
          body={
            <Stack gap="4">
              <Text textStyle="sm" fontWeight="bold">
                {t('openalexTab.acceptingWork', {
                  title: acceptingWork.title,
                })}
              </Text>

              <RadioGroup.Root
                value={visibility}
                onValueChange={(details) =>
                  setVisibility(details.value as 'PRIVATE' | 'FPTU_COMMUNITY')
                }
              >
                <Stack gap="3">
                  <RadioGroup.Item value="PRIVATE">
                    <RadioGroup.ItemHiddenInput />
                    <RadioGroup.ItemIndicator />
                    <Box>
                      <Text textStyle="sm" fontWeight="bold">
                        {t('openalexTab.visibilityPrivate')}
                      </Text>
                      <Text textStyle="sm" color="fg.muted">
                        {t('openalexTab.visibilityPrivateHint')}
                      </Text>
                    </Box>
                  </RadioGroup.Item>
                  <RadioGroup.Item value="FPTU_COMMUNITY">
                    <RadioGroup.ItemHiddenInput />
                    <RadioGroup.ItemIndicator />
                    <Box>
                      <Text textStyle="sm" fontWeight="bold">
                        {t('openalexTab.visibilityPublic')}
                      </Text>
                      <Text textStyle="sm" color="fg.muted">
                        {t('openalexTab.visibilityPublicHint')}
                      </Text>
                    </Box>
                  </RadioGroup.Item>
                </Stack>
              </RadioGroup.Root>
            </Stack>
          }
          confirmLabel={t('openalexTab.confirmAccept')}
          onConfirm={() =>
            acceptingWork ? handleAccept(acceptingWork) : undefined
          }
          isConfirming={operationType === 'accept'}
          colorPalette="blue"
        />
      ) : null}
    </Box>
  );
}
