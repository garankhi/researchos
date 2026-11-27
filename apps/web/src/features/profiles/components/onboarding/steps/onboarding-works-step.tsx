'use client';

import { useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  RadioGroup,
  Stack,
  Text,
} from '@chakra-ui/react';
import { Check, Download, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import type { CandidateWorkDto } from '../../../types';

/**
 * The props of the works step.
 */
export interface OnboardingWorksStepProps {
  /** The candidates the pull produced. */
  candidates: CandidateWorkDto[];
  /** Whether the candidate list is still loading. */
  isLoading: boolean;
  /** Whether the candidate list failed to load. */
  isFailed: boolean;
  /** Whether a pull is in flight. */
  isPulling: boolean;
  /** Whether an accept or a reject is in flight. */
  isDeciding: boolean;
  /** Retries the candidate list. */
  onRetry: () => void;
  /** Fetches more works from OpenAlex. */
  onFetchMore: () => Promise<void>;
  /** Accepts a candidate. */
  onAccept: (
    work: CandidateWorkDto,
    visibility: 'PRIVATE' | 'FPTU_COMMUNITY',
  ) => Promise<void>;
  /** Rejects a candidate. */
  onReject: (work: CandidateWorkDto) => Promise<void>;
}

/**
 * The fourth step of the onboarding: the candidate works.
 *
 * The step is **optional**. The pull wrote the works as candidates, and
 * the researcher accepts each one — privately or for the FPTU
 * community — or rejects it.
 *
 * A rejected work is never deleted: it stays in the profile as a
 * candidate the researcher can accept later. The step says so, because
 * a researcher who rejects a work by mistake would otherwise think the
 * work is gone.
 */
export function OnboardingWorksStep({
  candidates,
  isLoading,
  isFailed,
  isPulling,
  isDeciding,
  onRetry,
  onFetchMore,
  onAccept,
  onReject,
}: OnboardingWorksStepProps) {
  const t = useTranslations('onboarding');

  const [operatingId, setOperatingId] = useState<string | null>(null);
  const [operationType, setOperationType] = useState<
    'accept' | 'reject' | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<'PRIVATE' | 'FPTU_COMMUNITY'>(
    'PRIVATE',
  );

  const handleAccept = async (work: CandidateWorkDto) => {
    setActionError(null);
    try {
      setOperatingId(work.id);
      setOperationType('accept');
      await onAccept(work, visibility);
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
      await onReject(work);
    } catch {
      setActionError(t('worksStep.failed'));
    } finally {
      setOperatingId(null);
      setOperationType(null);
    }
  };

  const handleFetchMore = async () => {
    setActionError(null);
    try {
      await onFetchMore();
    } catch {
      setActionError(t('worksStep.failed'));
    }
  };

  return (
    <Stack gap="5">
      <Box>
        <Heading as="h2" size="md" fontWeight="bold">
          {t('worksStep.title')}
        </Heading>
        <Text textStyle="sm" color="fg.muted" mt="2">
          {t('worksStep.description')}
        </Text>
      </Box>

      <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '5' }}>
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
        <ErrorState title={t('worksStep.failed')} onRetry={onRetry} />
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

                <Heading as="h3" size="sm" fontWeight="bold" lineHeight="1.35">
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
                    disabled={isCurrentOperating || isDeciding}
                    loading={isRejecting}
                  >
                    <X />
                    {t('worksStep.reject')}
                  </Button>
                  <Button
                    size="xs"
                    onClick={() => void handleAccept(work)}
                    disabled={isCurrentOperating || isDeciding}
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

      <Flex justify="flex-end">
        <Button
          variant="outline"
          onClick={() => void handleFetchMore()}
          loading={isPulling}
        >
          <Download />
          {t('worksStep.fetchMore')}
        </Button>
      </Flex>
    </Stack>
  );
}
