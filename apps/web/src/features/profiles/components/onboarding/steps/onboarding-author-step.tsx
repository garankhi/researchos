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
import { UserCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import type { OpenAlexAuthorCandidateDto } from '@/lib/api/models';

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
  /** Confirms an author, or unconfirms it when it is the current one. */
  onConfirm: (shortId: string, orcid: string | null) => void;
  /** Skips the step: no author is confirmed. */
  onSkip: () => void;
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
 */
export function OnboardingAuthorStep({
  authors,
  mode,
  isLoading,
  isFailed,
  onRetry,
  confirmedAuthorId,
  onConfirm,
  onSkip,
}: OnboardingAuthorStepProps) {
  const t = useTranslations('onboarding');

  const [selectedAuthor, setSelectedAuthor] = useState<string | null>(
    confirmedAuthorId,
  );
  const [actionError, setActionError] = useState<string | null>(null);

  const handleConfirm = () => {
    if (!selectedAuthor) {
      return;
    }
    setActionError(null);
    /*
     * The ORCID comes from the list the step already loaded, so
     * confirming an author costs no extra request.
     */
    const chosen = authors.find((author) => author.shortId === selectedAuthor);
    onConfirm(selectedAuthor, chosen?.orcid ?? null);
  };

  const handleSkip = () => {
    setActionError(null);
    onSkip();
  };

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

      {actionError ? (
        <ErrorState title={t('authorStep.failed')} message={actionError} />
      ) : null}

      {isFailed ? (
        <ErrorState title={t('authorStep.failed')} onRetry={onRetry} />
      ) : null}

      {isLoading ? (
        <Text textStyle="sm" color="fg.muted">
          {t('authorStep.loading')}
        </Text>
      ) : null}

      {!isLoading && !isFailed && authors.length === 0 ? (
        <EmptyState
          title={t('authorStep.emptyTitle')}
          message={t('authorStep.emptyMessage')}
        />
      ) : null}

      {authors.length > 0 ? (
        <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '5' }}>
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
            <Button variant="outline" onClick={handleSkip}>
              {confirmedAuthorId ? t('authorStep.clear') : t('authorStep.skip')}
            </Button>
            <Button onClick={handleConfirm} disabled={!selectedAuthor}>
              <UserCheck />
              {t('authorStep.confirm')}
            </Button>
          </Flex>
        </Box>
      ) : null}

      {authors.length === 0 && !isLoading && !isFailed ? (
        <Flex justify="flex-end">
          <Button onClick={handleSkip}>{t('authorStep.continue')}</Button>
        </Flex>
      ) : null}

      {mode === 'AUTHOR_ID' || mode === 'ORCID' ? (
        <Text textStyle="xs" color="fg.muted">
          {t('authorStep.alreadyLinked')}
        </Text>
      ) : null}
    </Stack>
  );
}
