'use client';

import { useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  Input,
  Stack,
  Text,
} from '@chakra-ui/react';
import { Plus, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { useInterestTopics } from '../../../hooks/use-onboarding';
import type { OnboardingStepProps } from './onboarding-types';

/**
 * The first step of the onboarding: the research interests.
 *
 * It is the only **mandatory** step. Everything else in the flow may be
 * skipped, but a researcher with no declared interest has nothing for
 * the platform to show them and nothing for the discovery to match on —
 * so the flow cannot be finished without one.
 *
 * The step therefore refuses to move on while the interest list is
 * empty, and the server refuses it too: the rule lives on both sides,
 * because the screen is a convenience and the server is the boundary.
 */
export function OnboardingInterestsStep({
  interests,
  onDeclare,
  isDeclaring,
}: OnboardingStepProps) {
  const t = useTranslations('onboarding');
  const tCommon = useTranslations('common');

  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const topics = useInterestTopics({ search, enabled: adding });

  const handleDeclare = async (topicId: string) => {
    setActionError(null);
    try {
      await onDeclare(topicId);
      setSearch('');
    } catch {
      setActionError(t('interestsStep.declareFailed'));
    }
  };

  return (
    <Stack gap="5">
      <Box>
        <Heading as="h2" size="md" fontWeight="bold">
          {t('interestsStep.title')}
        </Heading>
        <Text textStyle="sm" color="fg.muted" mt="2">
          {t('interestsStep.description')}
        </Text>
      </Box>

      {actionError ? (
        <ErrorState
          title={t('interestsStep.declareFailed')}
          message={actionError}
        />
      ) : null}

      <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '5' }}>
        <Flex gap="2" align="center" flexWrap="wrap">
          <Heading as="h3" size="sm" fontWeight="bold">
            {t('interestsStep.selected', { count: interests.length })}
          </Heading>
          <Button
            size="xs"
            variant="outline"
            onClick={() => setAdding((open) => !open)}
            ml="auto"
          >
            {adding ? <Search /> : <Plus />}
            {adding ? tCommon('close') : t('interestsStep.add')}
          </Button>
        </Flex>

        {adding ? (
          <Box mt="4">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('interestsStep.searchPlaceholder')}
              aria-label={t('interestsStep.searchPlaceholder')}
            />

            {topics.isLoading ? (
              <Text textStyle="sm" color="fg.muted" mt="3">
                {t('interestsStep.searching')}
              </Text>
            ) : null}

            {topics.isFailed ? (
              <Box mt="3">
                <ErrorState
                  title={t('interestsStep.searchFailed')}
                  onRetry={() => void topics.refetch()}
                />
              </Box>
            ) : null}

            {!topics.isLoading &&
            !topics.isFailed &&
            topics.topics.length === 0 ? (
              <Box mt="3">
                <EmptyState
                  title={t('interestsStep.noTopicsTitle')}
                  message={t('interestsStep.noTopicsMessage')}
                />
              </Box>
            ) : null}

            {topics.topics.length > 0 ? (
              <Stack
                gap="0"
                mt="3"
                maxH="64"
                overflowY="auto"
                borderWidth="1px"
                borderColor="border"
              >
                {topics.topics.map((topic) => {
                  const isSelected = interests.some(
                    (interest) => interest.topicId === topic.id,
                  );
                  return (
                    <Button
                      key={topic.id}
                      variant={isSelected ? 'solid' : 'ghost'}
                      layerStyle={isSelected ? undefined : 'interactiveRow'}
                      justifyContent="flex-start"
                      disabled={isSelected || isDeclaring}
                      onClick={() => void handleDeclare(topic.id)}
                    >
                      {topic.name}
                    </Button>
                  );
                })}
              </Stack>
            ) : null}
          </Box>
        ) : null}

        {interests.length === 0 ? (
          <Box mt="4">
            <EmptyState
              title={t('interestsStep.emptyTitle')}
              message={t('interestsStep.emptyMessage')}
            />
          </Box>
        ) : (
          <Stack gap="2" mt="4">
            {interests.map((interest) => (
              <Flex key={interest.topicId} gap="2" align="baseline" wrap="wrap">
                <Badge colorPalette="green" size="sm" variant="surface">
                  {interest.topicName}
                </Badge>
                {interest.topicPath ? (
                  <Text textStyle="xs" color="fg.muted">
                    {interest.topicPath}
                  </Text>
                ) : null}
              </Flex>
            ))}
          </Stack>
        )}
      </Box>
    </Stack>
  );
}
