'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Box,
  Flex,
  Grid,
  Heading,
  RadioGroup,
  Stack,
  Text,
  useBreakpointValue,
} from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import type { OpenAlexAuthorCandidateDto } from '@/lib/api/models';
import type { OnboardingDraftOpenAlexAuthor } from '../../../store/onboarding-draft-store';
import { OnboardingAuthorDetail } from './onboarding-author-detail';
import { OnboardingAuthorStepSkeleton } from './onboarding-step-skeletons';

/**
 * The props of the author step.
 */
export interface OnboardingAuthorStepProps {
  /** The author candidates the platform found. */
  authors: OpenAlexAuthorCandidateDto[];
  /** How the list was produced: AUTHOR_ID, ORCID or NAME. */
  mode: 'AUTHOR_ID' | 'ORCID' | 'NAME' | null;
  /** Whether the list is still loading. */
  isLoading: boolean;
  /** Whether the list failed to load. */
  isFailed: boolean;
  /** Retries the author search. */
  onRetry: () => void;
  /** The author the researcher confirmed, from the draft. */
  confirmedAuthorId: string | null;
  /**
   * The candidate the researcher picked in the list.
   *
   * The step owns the selection, because the list is what the
   * researcher picks from — but the *decision* is the flow's: the
   * Next button confirms the picked candidate, and the Skip button
   * leaves the step without one. The step therefore only reports what
   * is picked and leaves the flow to act on it.
   */
  selectedAuthorId: string | null;
  /** Reports the candidate the researcher picked in the list. */
  onSelect: (shortId: string) => void;
}

/**
 * The second step of the onboarding: the OpenAlex author.
 *
 * The platform searched OpenAlex by the researcher's name, scoped to
 * FPT University, and offers the candidates. The researcher ticks the
 * one that is theirs.
 *
 * The step is **optional**. A researcher may have no OpenAlex profile
 * at all, and the byline-name fallback keeps working — so skipping is a
 * valid answer, not a failure.
 *
 * ## Why the affiliation is shown
 *
 * The badge is the signal that matters. OpenAlex merges duplicate author
 * profiles, so a name can resolve to an author whose works belong to
 * several people — and the affiliation is what tells the researcher
 * which one is theirs.
 *
 * ## Why the choice is reversible
 *
 * The step is a draft, so confirming an author writes nothing yet. The
 * researcher may pick a different one, or unconfirm the current one, and
 * the works preview follows the change. That is why the step shows the
 * current choice and lets the researcher take it back.
 *
 * ## Why the step has no buttons of its own
 *
 * The flow has one Next button and one Skip button, and they mean the
 * same thing on every step. A step that also carries a "This is me" and
 * a "Save" button gives the researcher three ways to leave a step, and
 * no way to tell which one they are supposed to use. So the step only
 * shows the choice — picking a candidate — and the flow's buttons act
 * on it.
 */
export function OnboardingAuthorStep({
  authors,
  mode,
  isLoading,
  isFailed,
  onRetry,
  confirmedAuthorId,
  selectedAuthorId,
  onSelect,
}: OnboardingAuthorStepProps) {
  const t = useTranslations('onboarding');

  /*
   * The candidate the detail panel describes. It is the selected one,
   * and the confirmed one when nothing is selected yet — a researcher
   * who comes back to the step sees the profile they confirmed, not an
   * empty panel.
   */
  const selectedCandidate = useMemo(() => {
    const wanted = selectedAuthorId ?? confirmedAuthorId;
    if (wanted === null) {
      return null;
    }
    return authors.find((author) => author.shortId === wanted) ?? null;
  }, [authors, selectedAuthorId, confirmedAuthorId]);

  /*
   * The panel is capped at the height of the list beside it, so the two
   * columns end where the list ends and the panel scrolls inside that
   * height. The height is measured rather than fixed, because the list
   * grows with the number of candidates.
   *
   * The measurement is skipped on a narrow screen: there the panel sits
   * under the list and is free to be as tall as it needs.
   */
  const isWide = useBreakpointValue({ base: false, lg: true });

  const listRef = useRef<HTMLDivElement | null>(null);
  const [listHeight, setListHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!isWide) {
      return;
    }
    const element = listRef.current;
    if (!element) {
      return;
    }
    const measure = () => setListHeight(element.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [isWide, authors.length]);

  return (
    <Stack gap="5">
      <Box>
        <Heading as="h2" size="md" fontWeight="bold">
          {t('authorStep.title')}
        </Heading>
        <Text textStyle="sm" color="fg.muted" mt="2">
          {t('authorStep.description')}
        </Text>
      </Box>

      {isFailed ? (
        <ErrorState title={t('authorStep.failed')} onRetry={onRetry} />
      ) : null}

      {isLoading ? (
        /*
         * The candidates are still coming. The step shows the shape of
         * what is arriving — the list on the left and the evidence panel
         * on the right — so the layout does not jump when the answers
         * land, and so the researcher sees that the search is running
         * rather than reading a line of text and guessing.
         */
        <OnboardingAuthorStepSkeleton />
      ) : null}

      {!isLoading && !isFailed && authors.length === 0 ? (
        <EmptyState
          title={t('authorStep.emptyTitle')}
          message={t('authorStep.emptyMessage')}
        />
      ) : null}

      {authors.length > 0 ? (
        /*
         * The list stays on the left, exactly as it was: a short list of
         * names with the affiliation and the work count. The panel on
         * the right carries the evidence — the metrics, the byline
         * spellings, the topics, the affiliations and the recent works
         * — of whichever candidate is selected.
         *
         * The two collapse into one column on a narrow screen: the panel
         * goes under the list, and it follows the selection there too.
         */
        <Grid
          templateColumns={{
            base: '1fr',
            lg: 'minmax(0, 4.75fr) minmax(0, 6.25fr)',
          }}
          gap="4"
          alignItems="start"
        >
          <Box
            ref={listRef}
            bg="bg.panel"
            boxShadow="xs"
            p={{ base: '4', md: '5' }}
          >
            <RadioGroup.Root
              /*
               * The confirmed author counts as picked.
               *
               * A researcher who comes back to the step sees the
               * author they confirmed still ticked, so the list reads
               * as their choice rather than as an empty list they have
               * to pick from again.
               */
              value={selectedAuthorId ?? confirmedAuthorId ?? undefined}
              onValueChange={(details) => {
                /*
                 * A radio group can be cleared, which arrives as a
                 * null. That is not a choice of author — it is the
                 * researcher un-ticking everything, which is what the
                 * Skip button is for.
                 */
                if (details.value !== null) {
                  onSelect(details.value);
                }
              }}
            >
              <Stack gap="4">
                {authors.map((author) => (
                  <RadioGroup.Item key={author.shortId} value={author.shortId}>
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
          </Box>

          <OnboardingAuthorDetail
            author={selectedCandidate ?? null}
            /*
             * The cap only applies on a wide screen. On a narrow one the
             * panel sits under the list and is free to be as tall as it
             * needs, so the measured height is not applied there.
             */
            maxHeight={isWide ? listHeight : null}
          />
        </Grid>
      ) : null}

      {mode === 'AUTHOR_ID' || mode === 'ORCID' ? (
        <Text textStyle="xs" color="fg.muted">
          {t('authorStep.alreadyLinked')}
        </Text>
      ) : null}
    </Stack>
  );
}

/**
 * The candidate, in the shape the draft keeps it.
 *
 * The draft holds a plain object rather than the generated DTO — the
 * API's shape is not the draft's, and the two are free to drift apart.
 */
export function toDraftOpenAlexAuthor(
  author: OpenAlexAuthorCandidateDto,
): OnboardingDraftOpenAlexAuthor {
  return {
    displayName: author.displayName,
    orcid: author.orcid,
    nameVariants: author.nameVariants,
    topics: author.topics.map((topic) => ({
      id: topic.id,
      name: topic.name,
      count: topic.count,
    })),
    affiliations: author.affiliationHistory.map((affiliation) => ({
      institutionId: affiliation.institutionId,
      name: affiliation.name,
      ror: affiliation.ror,
      countryCode: affiliation.countryCode,
      institutionType: affiliation.institutionType,
      yearStart: affiliation.yearStart,
      yearEnd: affiliation.yearEnd,
    })),
    counts: {
      worksCount: author.counts.worksCount,
      citedByCount: author.counts.citedByCount,
      hIndex: author.counts.hIndex,
      i10Index: author.counts.i10Index,
      twoYearMeanCitedness: author.counts.twoYearMeanCitedness,
    },
  };
}
