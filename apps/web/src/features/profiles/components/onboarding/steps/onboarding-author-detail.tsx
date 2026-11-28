'use client';

import {
  Badge,
  Box,
  Flex,
  Heading,
  Icon,
  Link,
  Stack,
  Text,
} from '@chakra-ui/react';
import { ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { OpenAlexAuthorCandidateDto } from '@/lib/api/models';

/**
 * The props of the recognition panel.
 */
export interface OnboardingAuthorDetailProps {
  /** The candidate the panel describes, or null when nothing is selected. */
  author: OpenAlexAuthorCandidateDto | null;
  /**
   * The height the panel is capped at, in pixels.
   *
   * The panel scrolls inside that height rather than growing past it,
   * so it stays the same height as the candidate list beside it. Null
   * lets the panel take the height it needs — which is what the
   * single-column layout wants.
   */
  maxHeight?: number | null;
}

/**
 * The detail of the selected OpenAlex candidate.
 *
 * ## Why the panel exists
 *
 * A Vietnamese name is not an identifier. A dozen researchers share one,
 * and OpenAlex merges the profiles that carry the same byline — so the
 * list on the left routinely holds two or three people with the same
 * name. The researcher is the only one who can say which profile is
 * theirs, and they can only say it from the *evidence*: the citation
 * metrics, the byline spellings they published under, the topics they
 * work on, the institutions they passed through, and the titles of
 * their papers.
 *
 * The panel shows all of it, for the selected candidate, so the choice
 * is made on evidence rather than on a hunch.
 *
 * ## Why the works are the headline
 *
 * "I wrote that paper" is the recognition a researcher can act on
 * instantly. The metrics confirm it, but nobody remembers their h-index;
 * they remember their own titles.
 */
export function OnboardingAuthorDetail({
  author,
  maxHeight = null,
}: OnboardingAuthorDetailProps) {
  const t = useTranslations('onboarding.authorStep.detail');

  if (!author) {
    return (
      <Box
        bg="bg.panel"
        boxShadow="xs"
        p={{ base: '4', md: '5' }}
        borderLeftWidth="3px"
        borderLeftColor="border.emphasized"
      >
        <Text textStyle="sm" color="fg.muted">
          {t('empty')}
        </Text>
      </Box>
    );
  }

  const counts = author.counts;
  const hasCounts =
    counts.citedByCount !== null ||
    counts.hIndex !== null ||
    counts.i10Index !== null ||
    counts.twoYearMeanCitedness !== null;

  return (
    <Box
      bg="bg.panel"
      boxShadow="xs"
      p={{ base: '4', md: '5' }}
      borderLeftWidth="3px"
      borderLeftColor="border.emphasized"
      maxHeight={maxHeight ?? undefined}
      overflowY={maxHeight !== null ? 'auto' : undefined}
    >
      <Stack gap="4">
        <Box>
          <Heading as="h3" size="sm" fontWeight="bold">
            {author.displayName}
          </Heading>
          <Flex gap="2" align="center" flexWrap="wrap" mt="1">
            {author.affiliationMatch ? (
              <Badge colorPalette="green" size="sm">
                {t('affiliationMatch')}
              </Badge>
            ) : null}
            {author.orcid ? (
              <Link
                href={orcidUrl(author.orcid)}
                target="_blank"
                rel="noopener noreferrer"
                display="inline-flex"
                alignItems="center"
                gap="1"
                textStyle="xs"
                color="fg.muted"
                layerStyle="researchTextLink"
              >
                {t('orcid')}
                <Icon as={ExternalLink} boxSize="3" aria-hidden />
              </Link>
            ) : null}
            <Link
              href={`https://openalex.org/${author.shortId}`}
              target="_blank"
              rel="noopener noreferrer"
              display="inline-flex"
              alignItems="center"
              gap="1"
              textStyle="xs"
              color="fg.muted"
              layerStyle="researchTextLink"
            >
              {t('openAlexProfile')}
              <Icon as={ExternalLink} boxSize="3" aria-hidden />
            </Link>
          </Flex>
        </Box>

        {hasCounts ? (
          <Box>
            <Text textStyle="xs" fontWeight="bold" color="fg.muted" mb="2">
              {t('metrics')}
            </Text>
            <Flex gap="4" flexWrap="wrap">
              <Metric
                label={t('works')}
                value={
                  counts.worksCount !== null ? String(counts.worksCount) : null
                }
              />
              <Metric
                label={t('citations')}
                value={
                  counts.citedByCount !== null
                    ? String(counts.citedByCount)
                    : null
                }
              />
              <Metric
                label={t('hIndex')}
                value={counts.hIndex !== null ? String(counts.hIndex) : null}
              />
              <Metric
                label={t('i10Index')}
                value={
                  counts.i10Index !== null ? String(counts.i10Index) : null
                }
              />
              <Metric
                label={t('twoYearCitedness')}
                value={
                  counts.twoYearMeanCitedness !== null
                    ? counts.twoYearMeanCitedness.toFixed(1)
                    : null
                }
              />
            </Flex>
          </Box>
        ) : null}

        {author.nameVariants.length > 0 ? (
          <Box>
            <Text textStyle="xs" fontWeight="bold" color="fg.muted" mb="2">
              {t('nameVariants')}
            </Text>
            <Flex gap="2" flexWrap="wrap">
              {author.nameVariants.map((variant) => (
                <Badge key={variant} colorPalette="purple" variant="surface">
                  {variant}
                </Badge>
              ))}
            </Flex>
          </Box>
        ) : null}

        {author.topics.length > 0 ? (
          <Box>
            <Text textStyle="xs" fontWeight="bold" color="fg.muted" mb="2">
              {t('topics')}
            </Text>
            <Flex gap="2" flexWrap="wrap">
              {author.topics.slice(0, 8).map((topic) => (
                <Badge key={topic.id} colorPalette="blue" variant="surface">
                  {topic.count !== null
                    ? `${topic.name} (${topic.count})`
                    : topic.name}
                </Badge>
              ))}
            </Flex>
          </Box>
        ) : null}

        {author.affiliationHistory.length > 0 ? (
          <Box>
            <Text textStyle="xs" fontWeight="bold" color="fg.muted" mb="2">
              {t('affiliations')}
            </Text>
            <Stack gap="1">
              {author.affiliationHistory.map((affiliation) => (
                <Flex key={affiliation.institutionId} gap="2" align="baseline">
                  <Text textStyle="sm">{affiliation.name}</Text>
                  <Text textStyle="xs" color="fg.muted">
                    {affiliationYear(
                      affiliation.yearStart,
                      affiliation.yearEnd,
                    )}
                  </Text>
                </Flex>
              ))}
            </Stack>
          </Box>
        ) : null}

        {author.recentWorks.length > 0 ? (
          <Box>
            <Text textStyle="xs" fontWeight="bold" color="fg.muted" mb="2">
              {t('recentWorks')}
            </Text>
            <Stack gap="3">
              {author.recentWorks.slice(0, 6).map((work) => (
                <Box key={work.workId}>
                  <Text textStyle="sm" fontWeight="medium">
                    {work.title}
                  </Text>
                  <Flex gap="2" align="center" flexWrap="wrap" mt="0.5">
                    {work.publicationYear ? (
                      <Text textStyle="xs" color="fg.muted">
                        {work.publicationYear}
                      </Text>
                    ) : null}
                    {work.venue ? (
                      <Text textStyle="xs" color="fg.muted" fontStyle="italic">
                        {work.venue}
                      </Text>
                    ) : null}
                    {work.affiliation ? (
                      <Text textStyle="xs" color="fg.muted">
                        {work.affiliation}
                      </Text>
                    ) : null}
                  </Flex>
                </Box>
              ))}
            </Stack>
          </Box>
        ) : null}
      </Stack>
    </Box>
  );
}

/**
 * One metric of the selected candidate.
 *
 * A metric OpenAlex reports as null is left out rather than shown as a
 * zero: "no h-index" and "an h-index of zero" are different facts, and
 * the second is a claim the platform cannot make.
 */
function Metric({ label, value }: { label: string; value: string | null }) {
  if (value === null) {
    return null;
  }
  return (
    <Box>
      <Text textStyle="md" fontWeight="bold" lineHeight="1.2">
        {value}
      </Text>
      <Text textStyle="xs" color="fg.muted">
        {label}
      </Text>
    </Box>
  );
}

/**
 * The years an affiliation held.
 *
 * A running affiliation has no end year yet, and OpenAlex reports the
 * range sparsely — the years in between are not spelled out — so the
 * range is the first and the last year.
 */
function affiliationYear(
  yearStart: number | null,
  yearEnd: number | null,
): string {
  if (yearStart !== null && yearEnd !== null) {
    return `${yearStart}–${yearEnd}`;
  }
  if (yearStart !== null) {
    return `${yearStart}–`;
  }
  if (yearEnd !== null) {
    return `–${yearEnd}`;
  }
  return '—';
}

/**
 * The ORCID page of an author.
 *
 * OpenAlex reports the ORCID as a URL, but the bare form
 * (`0000-0002-1825-0097`) is what a researcher types and what a
 * profile may hold — both land on the same page.
 */
function orcidUrl(orcid: string): string {
  const trimmed = orcid.trim();
  if (trimmed === '') {
    return 'https://orcid.org/';
  }
  if (trimmed.startsWith('http')) {
    return trimmed;
  }
  return `https://orcid.org/${trimmed.replace(/^orcid:\s*/i, '')}`;
}
