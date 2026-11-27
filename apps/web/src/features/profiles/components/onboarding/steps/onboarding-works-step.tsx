'use client';

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
import { BookOpen, Check, ExternalLink, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { doiUrl } from '@/lib/doi-url';
import type { OnboardingWorkPreview } from '../../../hooks/use-onboarding';
import type { OnboardingDraftWorkDecision } from '../../../store/onboarding-draft-store';
import { OnboardingWorksStepSkeleton } from './onboarding-step-skeletons';

/**
 * The props of the works step.
 */
export interface OnboardingWorksStepProps {
  /** The works OpenAlex holds for the confirmed author. */
  works: OnboardingWorkPreview[];
  /** Whether the preview is still loading. */
  isLoading: boolean;
  /** Whether the preview failed to load. */
  isFailed: boolean;
  /** Retries the preview. */
  onRetry: () => void;
  /** The decisions the researcher made, by OpenAlex work id. */
  decisions: Record<string, OnboardingDraftWorkDecision>;
  /** Records a decision on a work. */
  onDecide: (
    workId: string,
    accepted: boolean,
    visibility: 'PRIVATE' | 'FPTU_COMMUNITY',
  ) => void;
  /** Withdraws a decision. */
  onUndecide: (workId: string) => void;
  /** The visibility an accepted work is published with. */
  visibility: 'PRIVATE' | 'FPTU_COMMUNITY';
  /** Changes the visibility an accepted work is published with. */
  onVisibilityChange: (visibility: 'PRIVATE' | 'FPTU_COMMUNITY') => void;
}

/**
 * The fourth step of the onboarding: the candidate works.
 *
 * The step is **optional**. It shows the works OpenAlex holds for the
 * confirmed author, live, and the researcher accepts each one — privately
 * or for the FPTU community — or rejects it.
 *
 * ## Why nothing is written here
 *
 * The step is a draft, so a decision is a local choice. The work is
 * pulled and the decision applied only at the end, and only for the
 * works the researcher actually decided on. A work they left alone is
 * never pulled — the platform does not fill their queue with works they
 * did not ask for.
 *
 * ## Why the decisions survive a change of author
 *
 * They do not: picking a different author in step 2 drops the
 * decisions, because they were decisions about somebody else's works.
 */
export function OnboardingWorksStep({
  works,
  isLoading,
  isFailed,
  onRetry,
  decisions,
  onDecide,
  onUndecide,
  visibility,
  onVisibilityChange,
}: OnboardingWorksStepProps) {
  const t = useTranslations('onboarding');

  const decidedCount = Object.keys(decisions).length;

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
            onVisibilityChange(details.value as 'PRIVATE' | 'FPTU_COMMUNITY')
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

      {decidedCount > 0 ? (
        <Text textStyle="sm" color="fg.muted">
          {t('worksStep.decidedCount', { count: decidedCount })}
        </Text>
      ) : null}

      {isFailed ? (
        <ErrorState title={t('worksStep.failed')} onRetry={onRetry} />
      ) : null}

      {isLoading ? (
        /*
         * The preview is still coming. The step shows the shape of what
         * is arriving — the visibility picker and the work cards — so
         * the layout does not jump when the works land, and so the
         * researcher sees the pull running rather than reading a line of
         * text and guessing.
         */
        <OnboardingWorksStepSkeleton />
      ) : null}

      {!isLoading && !isFailed && works.length === 0 ? (
        <EmptyState
          title={t('worksStep.emptyTitle')}
          message={t('worksStep.emptyMessage')}
        />
      ) : null}

      <Stack gap="3">
        {works.map((work) => {
          const decision = decisions[work.workId];
          const isAccepted = decision?.accepted === true;
          const isRejected = decision?.accepted === false;
          const authorsStr = work.authors.join(', ');

          return (
            <Box
              key={work.workId}
              bg="bg.panel"
              boxShadow="xs"
              p={{ base: '4', md: '5' }}
              borderLeftWidth="3px"
              borderLeftColor={
                isAccepted
                  ? 'border.emphasized'
                  : isRejected
                    ? 'border.muted'
                    : 'transparent'
              }
            >
              {/*
               * The card carries the same evidence the profile's OpenAlex
               * tab shows: the type and the year, the title, the venue,
               * the byline, the abstract, and the links out to the DOI
               * and to OpenAlex.
               *
               * It has to. The researcher is being asked to say whether a
               * paper is theirs, and they can only answer that from the
               * paper — a title and a year is not enough to recognise a
               * paper whose author list they half remember.
               */}
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
                  {isAccepted ? (
                    <Badge colorPalette="green" size="sm">
                      {t('worksStep.accepted')}
                    </Badge>
                  ) : null}
                  {isRejected ? (
                    <Badge colorPalette="gray" size="sm">
                      {t('worksStep.rejected')}
                    </Badge>
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
                    lineClamp={3}
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

                    {work.canonicalId ? (
                      <Link
                        href={work.canonicalId}
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
                    {decision ? (
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => onUndecide(work.workId)}
                      >
                        <X />
                        {t('worksStep.undo')}
                      </Button>
                    ) : null}
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => onDecide(work.workId, false, visibility)}
                      disabled={isRejected}
                    >
                      <X />
                      {t('worksStep.reject')}
                    </Button>
                    <Button
                      size="xs"
                      onClick={() => onDecide(work.workId, true, visibility)}
                      disabled={isAccepted}
                    >
                      <Check />
                      {t('worksStep.accept')}
                    </Button>
                  </Flex>
                </Flex>
              </Stack>
            </Box>
          );
        })}
      </Stack>
    </Stack>
  );
}
