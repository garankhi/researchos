'use client';

import { useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Container,
  Flex,
  Heading,
  RadioGroup,
  Stack,
  Text,
} from '@chakra-ui/react';
import { Check, Download, UserCheck, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSnackbar } from '@/components/providers/snackbar-provider';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { useOpenAlexCandidates } from '@/features/profiles';
import type { CandidateWorkDto } from '@/features/profiles';
import { useOpenAlexOnboarding } from '../hooks/use-openalex-onboarding';

/**
 * The OpenAlex onboarding of a fresh researcher.
 *
 * The researcher arrives with only a name and an email. The flow has
 * two steps:
 *
 * 1. **The author.** The platform searched OpenAlex by name plus the
 *    hard-coded FPT University affiliation and offers the candidates.
 *    The researcher confirms the one that is theirs, or skips. Skipping
 *    is a valid answer — the researcher may have no OpenAlex profile at
 *    all, and the name fallback keeps working.
 * 2. **The works.** The pull writes the works as candidates, and the
 *    researcher accepts each one — publicly or privately — or rejects
 *    it. A rejected work is never deleted; it stays in the profile for
 *    a later accept.
 */
export function OpenAlexOnboarding({
  onFinish,
}: {
  /** Called when the researcher leaves the flow. */
  onFinish?: () => void;
}) {
  const t = useTranslations('onboarding');
  const { showSnackbar } = useSnackbar();

  const [step, setStep] = useState<'author' | 'works'>('author');
  const [authorId, setAuthorId] = useState<string | undefined>(undefined);
  const [selectedAuthor, setSelectedAuthor] = useState<string | null>(null);

  const {
    authors,
    mode,
    isLoadingAuthors,
    isFailedAuthors,
    refetchAuthors,
    pullWorks,
    isPulling,
  } = useOpenAlexOnboarding({ step, authorId });

  const { candidates, isLoading, isFailed, refetch, acceptWork, rejectWork } =
    useOpenAlexCandidates();

  const [operatingId, setOperatingId] = useState<string | null>(null);
  const [operationType, setOperationType] = useState<
    'accept' | 'reject' | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<'PRIVATE' | 'FPTU_COMMUNITY'>(
    'PRIVATE',
  );

  const handleConfirmAuthor = async () => {
    if (!selectedAuthor) {
      return;
    }
    setActionError(null);
    try {
      // The pull records the confirmed author on the profile, so every
      // later pull resolves through it instead of the name fallback.
      await pullWorks(selectedAuthor);
      setAuthorId(selectedAuthor);
      setStep('works');
    } catch {
      setActionError(t('authorStep.failed'));
    }
  };

  const handleSkip = async () => {
    setActionError(null);
    try {
      // Skipping is a valid answer: the pull falls back to the byline
      // name plus the hard-coded affiliation.
      await pullWorks();
      setStep('works');
    } catch {
      setActionError(t('authorStep.failed'));
    }
  };

  const handleAccept = async (work: CandidateWorkDto) => {
    setActionError(null);
    try {
      setOperatingId(work.id);
      setOperationType('accept');
      await acceptWork(work.id, { visibility });
      showSnackbar({
        message: t('worksStep.accepted'),
        severity: 'success',
      });
    } catch {
      setActionError(t('worksStep.failed'));
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
        message: t('worksStep.rejected'),
        severity: 'info',
      });
    } catch {
      setActionError(t('worksStep.failed'));
    } finally {
      setOperatingId(null);
      setOperationType(null);
    }
  };

  if (step === 'author') {
    return (
      <Container maxW="48rem" py={{ base: '6', md: '10' }}>
        <Stack gap="6">
          <Box>
            <Heading as="h1" size="lg" fontWeight="bold">
              {t('authorStep.title')}
            </Heading>
            <Text textStyle="sm" color="fg.muted" mt="2">
              {t('authorStep.description')}
            </Text>
          </Box>

          {actionError ? (
            <ErrorState title={t('authorStep.failed')} message={actionError} />
          ) : null}

          {isFailedAuthors ? (
            <ErrorState
              title={t('authorStep.failed')}
              onRetry={() => void refetchAuthors()}
            />
          ) : null}

          {isLoadingAuthors ? (
            <Stack gap="3">
              <Text textStyle="sm" color="fg.muted">
                {t('authorStep.loading')}
              </Text>
            </Stack>
          ) : null}

          {!isLoadingAuthors && !isFailedAuthors && authors.length === 0 ? (
            <EmptyState
              title={t('authorStep.emptyTitle')}
              message={t('authorStep.emptyMessage')}
            />
          ) : null}

          {authors.length > 0 ? (
            <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '6' }}>
              <RadioGroup.Root
                value={selectedAuthor}
                onValueChange={(details) => setSelectedAuthor(details.value)}
              >
                <Stack gap="4">
                  {authors.map((author) => (
                    <RadioGroup.Item
                      key={author.shortId}
                      value={author.shortId}
                    >
                      <RadioGroup.ItemHiddenInput />
                      <RadioGroup.ItemIndicator />
                      <Box>
                        <Text textStyle="sm" fontWeight="bold">
                          {author.displayName}
                        </Text>
                        <Flex gap="2" align="center" flexWrap="wrap" mt="1">
                          {author.affiliationMatch ? (
                            <Badge colorPalette="green" size="sm">
                              {t('authorStep.affiliationMatch')}
                            </Badge>
                          ) : null}
                          {author.worksCount !== null ? (
                            <Text textStyle="xs" color="fg.muted">
                              {t('authorStep.worksCount', {
                                count: author.worksCount,
                              })}
                            </Text>
                          ) : null}
                          {author.orcid ? (
                            <Text textStyle="xs" color="fg.muted">
                              {author.orcid}
                            </Text>
                          ) : null}
                        </Flex>
                      </Box>
                    </RadioGroup.Item>
                  ))}
                </Stack>
              </RadioGroup.Root>

              <Flex mt="6" gap="3" justify="flex-end" flexWrap="wrap">
                <Button variant="outline" onClick={() => void handleSkip()}>
                  {t('authorStep.skip')}
                </Button>
                <Button
                  onClick={() => void handleConfirmAuthor()}
                  disabled={!selectedAuthor}
                  loading={isPulling}
                >
                  <UserCheck />
                  {t('authorStep.confirm')}
                </Button>
              </Flex>
            </Box>
          ) : null}

          {authors.length === 0 && !isLoadingAuthors && !isFailedAuthors ? (
            <Flex justify="flex-end">
              <Button onClick={() => void handleSkip()} loading={isPulling}>
                {t('authorStep.continue')}
              </Button>
            </Flex>
          ) : null}

          {mode === 'AUTHOR_ID' || mode === 'ORCID' ? (
            <Text textStyle="xs" color="fg.muted">
              {t('authorStep.alreadyLinked')}
            </Text>
          ) : null}
        </Stack>
      </Container>
    );
  }

  return (
    <Container maxW="48rem" py={{ base: '6', md: '10' }}>
      <Stack gap="6">
        <Box>
          <Heading as="h1" size="lg" fontWeight="bold">
            {t('worksStep.title')}
          </Heading>
          <Text textStyle="sm" color="fg.muted" mt="2">
            {t('worksStep.description')}
          </Text>
        </Box>

        <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '6' }}>
          <Text textStyle="sm" fontWeight="bold" mb="3">
            {t('worksStep.visibilityLabel')}
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
                    {t('worksStep.visibilityPrivate')}
                  </Text>
                  <Text textStyle="sm" color="fg.muted">
                    {t('worksStep.visibilityPrivateHint')}
                  </Text>
                </Box>
              </RadioGroup.Item>
              <RadioGroup.Item value="FPTU_COMMUNITY">
                <RadioGroup.ItemHiddenInput />
                <RadioGroup.ItemIndicator />
                <Box>
                  <Text textStyle="sm" fontWeight="bold">
                    {t('worksStep.visibilityPublic')}
                  </Text>
                  <Text textStyle="sm" color="fg.muted">
                    {t('worksStep.visibilityPublicHint')}
                  </Text>
                </Box>
              </RadioGroup.Item>
            </Stack>
          </RadioGroup.Root>
        </Box>

        {actionError ? (
          <ErrorState title={t('worksStep.failed')} message={actionError} />
        ) : null}

        {isFailed ? (
          <ErrorState title={t('worksStep.failed')} onRetry={refetch} />
        ) : null}

        {isLoading ? (
          <Text textStyle="sm" color="fg.muted">
            {t('worksStep.loading')}
          </Text>
        ) : null}

        {!isLoading && !isFailed && candidates.length === 0 ? (
          <EmptyState
            title={t('worksStep.emptyTitle')}
            message={t('worksStep.emptyMessage')}
          />
        ) : null}

        <Stack gap="3">
          {candidates.map((work) => {
            const isCurrentOperating = operatingId === work.id;
            const isAccepting =
              isCurrentOperating && operationType === 'accept';
            const isRejecting =
              isCurrentOperating && operationType === 'reject';

            return (
              <Box
                key={work.id}
                bg="bg.panel"
                boxShadow="xs"
                p={{ base: '4', md: '5' }}
              >
                <Stack gap="2">
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
                    size="sm"
                    fontWeight="bold"
                    lineHeight="1.35"
                  >
                    {work.title}
                  </Heading>

                  {work.venue ? (
                    <Text textStyle="sm" color="fg.muted" fontStyle="italic">
                      {work.venue}
                    </Text>
                  ) : null}

                  <Flex gap="2" justify="flex-end" pt="1">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => void handleReject(work)}
                      disabled={isCurrentOperating}
                      loading={isRejecting}
                    >
                      <X />
                      {t('worksStep.reject')}
                    </Button>
                    <Button
                      size="xs"
                      onClick={() => void handleAccept(work)}
                      disabled={isCurrentOperating}
                      loading={isAccepting}
                    >
                      <Check />
                      {t('worksStep.accept')}
                    </Button>
                  </Flex>
                </Stack>
              </Box>
            );
          })}
        </Stack>

        <Flex justify="flex-end" gap="3" flexWrap="wrap">
          <Button
            variant="outline"
            onClick={() => void pullWorks()}
            loading={isPulling}
          >
            <Download />
            {t('worksStep.fetchMore')}
          </Button>
          <Button onClick={onFinish}>{t('worksStep.finish')}</Button>
        </Flex>
      </Stack>
    </Container>
  );
}
