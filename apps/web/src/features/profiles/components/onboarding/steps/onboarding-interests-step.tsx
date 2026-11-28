'use client';

import { useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Combobox,
  createListCollection,
  Flex,
  Heading,
  IconButton,
  Portal,
  Stack,
  Text,
  Wrap,
} from '@chakra-ui/react';
import { Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
 *
 * ## Why a combobox
 *
 * The taxonomy is long, and the researcher knows roughly what they are
 * looking for. A combobox gives them the type-to-filter they need and
 * the keyboard navigation they expect, and its popup floats over the
 * content rather than pushing the layout around — the panel that shows
 * their picks must not move while they are picking.
 *
 * ## Why the selection is multiple
 *
 * A researcher usually works across a few areas, and picking them one
 * at a time — reopening the list, adding, closing — is friction for
 * no benefit. The combobox is therefore multi-select: the list stays
 * open, the picked topics stay in it and carry a check, and the
 * researcher keeps going until they have what they need.
 *
 * The collection loads asynchronously as the researcher types, so the
 * list always reflects the search and never the whole taxonomy.
 *
 * ## Why the choices are reversible
 *
 * The step is a draft, so nothing here is stored until the researcher
 * finishes the onboarding. That makes every choice reversible: a topic
 * that was picked by mistake can be taken back, and the flow does not
 * need a "are you sure?" for a change it can undo by pressing Finish
 * again.
 */
export function OnboardingInterestsStep({
  topicIds,
  topicNames,
  onAdd,
  onRemove,
}: OnboardingStepProps) {
  const t = useTranslations('onboarding');

  const [search, setSearch] = useState('');

  const topics = useInterestTopics({ search });

  /*
   * The picked topics are merged into the collection so the combobox
   * can resolve the labels of the current selection — a picked topic
   * that is not in the current search result still has to be shown as
   * selected, and its name has to survive in the input.
   */
  const items = useMemo(() => {
    const merged = new Map<string, { id: string; name: string }>();
    for (const topic of topics.topics) {
      merged.set(topic.id, { id: topic.id, name: topic.name });
    }
    for (const topicId of topicIds) {
      if (!merged.has(topicId)) {
        merged.set(topicId, {
          id: topicId,
          name: topicNames[topicId] ?? topicId,
        });
      }
    }
    return [...merged.values()];
  }, [topics.topics, topicIds, topicNames]);

  const collection = useMemo(
    () =>
      createListCollection({
        items,
        itemToString: (topic) => topic.name,
        itemToValue: (topic) => topic.id,
      }),
    [items],
  );

  /*
   * The combobox owns the selection while the researcher is inside the
   * list; the draft store owns it afterwards. The diff is what turns
   * one combobox event into the store's "add" and "remove" actions.
   */
  const handleValueChange = (value: string[]) => {
    const selected = new Set(value);
    for (const topicId of topicIds) {
      if (!selected.has(topicId)) {
        onRemove(topicId);
      }
    }
    for (const topicId of value) {
      if (!topicIds.includes(topicId)) {
        const topic = items.find((candidate) => candidate.id === topicId);
        if (topic) {
          onAdd(topic.id, topic.name);
        }
      }
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

      <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '5' }}>
        <Flex gap="2" align="center" flexWrap="wrap">
          <Heading as="h3" size="sm" fontWeight="bold">
            {t('interestsStep.selected', { count: topicIds.length })}
          </Heading>
        </Flex>

        <Combobox.Root
          multiple
          collection={collection}
          variant="subtle"
          openOnClick
          loading={topics.isLoading}
          value={topicIds}
          inputValue={search}
          onInputValueChange={({ inputValue }) => setSearch(inputValue)}
          onValueChange={({ value }) => handleValueChange(value)}
        >
          {/*
           * The picked topics are shown as chips above the input, the
           * way a multi-select is expected to show them: the researcher
           * sees the whole selection at a glance, and can take a pick
           * back without opening the list.
           */}
          {topicIds.length > 0 && (
            <Wrap gap="2" mt="3">
              {topicIds.map((topicId) => (
                <Badge
                  key={topicId}
                  colorPalette="green"
                  size="sm"
                  variant="surface"
                  display="inline-flex"
                  alignItems="center"
                  gap="1"
                >
                  {topicNames[topicId] ?? topicId}
                  <IconButton
                    aria-label={t('interestsStep.remove')}
                    variant="ghost"
                    size="2xs"
                    onClick={() => onRemove(topicId)}
                  >
                    <X />
                  </IconButton>
                </Badge>
              ))}
            </Wrap>
          )}

          <Combobox.Label srOnly>
            {t('interestsStep.searchPlaceholder')}
          </Combobox.Label>
          <Combobox.Control>
            <Combobox.Input
              placeholder={t('interestsStep.searchPlaceholder')}
            />
            <Combobox.IndicatorGroup>
              <Combobox.Trigger />
            </Combobox.IndicatorGroup>
          </Combobox.Control>

          {/*
           * The list lives in a portal so the floating popup is not
           * clipped by the panel it is anchored to.
           */}
          <Portal>
            <Combobox.Positioner>
              <Combobox.Content maxH="60" boxShadow="overlayPanel">
                <Combobox.ItemGroup>
                  <Combobox.ItemGroupLabel>
                    {t('interestsStep.topicGroup')}
                  </Combobox.ItemGroupLabel>
                  {collection.items.map((topic) => (
                    <Combobox.Item
                      key={topic.id}
                      item={topic}
                      layerStyle="interactiveRow"
                    >
                      <Combobox.ItemIndicator>
                        <Check />
                      </Combobox.ItemIndicator>
                      <Combobox.ItemText>{topic.name}</Combobox.ItemText>
                    </Combobox.Item>
                  ))}
                  <Combobox.Empty>
                    {topics.isFailed
                      ? t('interestsStep.searchFailed')
                      : t('interestsStep.noTopicsMessage')}
                  </Combobox.Empty>
                </Combobox.ItemGroup>
              </Combobox.Content>
            </Combobox.Positioner>
          </Portal>
        </Combobox.Root>

        {topicIds.length === 0 && (
          <Box mt="4">
            <Text textStyle="sm" color="fg.muted">
              {t('interestsStep.emptyMessage')}
            </Text>
          </Box>
        )}
      </Box>
    </Stack>
  );
}
