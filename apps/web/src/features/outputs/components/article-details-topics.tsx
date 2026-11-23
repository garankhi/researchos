import { useState } from 'react';
import {
  Button,
  Combobox,
  createListCollection,
  Flex,
  Stack,
  Text,
} from '@chakra-ui/react';
import { Plus, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

export type ArticleTopic = { id: string; name: string };

export function ArticleDetailsTopics({
  topics,
  suggestions,
  suggestionsLoading,
  suggestionsUnavailable,
  selectedIds,
  onChange,
  onSearch,
  isLoading,
  isFailed,
}: {
  topics: ArticleTopic[];
  suggestions: ArticleTopic[];
  suggestionsLoading: boolean;
  suggestionsUnavailable: boolean;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onSearch?: (query: string) => void;
  isLoading?: boolean;
  isFailed?: boolean;
}) {
  const t = useTranslations('articleDetails');
  const locale = useLocale();
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<ArticleTopic[]>([]);
  const catalog = new Map(
    [...chosen, ...suggestions, ...topics].map((topic) => [topic.id, topic]),
  );
  const query = search.trim().toLocaleLowerCase(locale);
  const matches = topics.filter(
    (topic) =>
      (onSearch || topic.name.toLocaleLowerCase(locale).includes(query)) &&
      !selectedIds.includes(topic.id),
  );
  const collection = createListCollection({
    items: matches,
    itemToString: (topic) => topic.name,
    itemToValue: (topic) => topic.id,
  });
  const recommended = suggestions
    .slice(0, 5)
    .filter((topic) => !selectedIds.includes(topic.id));

  function select(topic: ArticleTopic) {
    setChosen((previous) => [
      ...previous.filter((item) => item.id !== topic.id),
      topic,
    ]);
    onChange([...selectedIds, topic.id]);
  }

  function renderOption(topic: ArticleTopic) {
    return (
      <Button
        key={topic.id}
        type="button"
        variant="outline"
        size="sm"
        h="auto"
        minH="8"
        py="1"
        whiteSpace="normal"
        overflowWrap="anywhere"
        textAlign="start"
        onClick={() => select(topic)}
      >
        <Plus aria-hidden />
        {topic.name}
      </Button>
    );
  }

  return (
    <Stack gap="4">
      <Combobox.Root
        collection={collection}
        variant="subtle"
        openOnClick
        selectionBehavior="clear"
        value={[]}
        inputValue={search}
        onInputValueChange={({ inputValue }) => {
          setSearch(inputValue);
          onSearch?.(inputValue);
        }}
        onValueChange={({ value: [id] }) => {
          const topic = id ? catalog.get(id) : undefined;
          if (topic && !selectedIds.includes(topic.id)) select(topic);
        }}
      >
        <Combobox.Label>{t('topics')}</Combobox.Label>
        <Combobox.Control>
          <Combobox.Input placeholder={t('searchTopics')} />
        </Combobox.Control>
        <Combobox.Positioner>
          <Combobox.Content maxH="60" boxShadow="overlayPanel">
            <Combobox.Empty>
              {t(
                isLoading
                  ? 'loadingTopics'
                  : isFailed
                    ? 'topicSearchFailed'
                    : 'noMatches',
              )}
            </Combobox.Empty>
            {collection.items.map((topic) => (
              <Combobox.Item
                key={topic.id}
                item={topic}
                layerStyle="interactiveRow"
              >
                <Combobox.ItemText>{topic.name}</Combobox.ItemText>
              </Combobox.Item>
            ))}
          </Combobox.Content>
        </Combobox.Positioner>
      </Combobox.Root>
      <Stack gap="2">
        <Text fontSize="sm" fontWeight="medium">
          {t('selectedTopics')}
        </Text>
        {selectedIds.length ? (
          <Flex wrap="wrap" gap="2">
            {selectedIds.map((id) => {
              const topic = catalog.get(id);
              if (!topic) return null;
              return (
                <Button
                  key={id}
                  type="button"
                  size="sm"
                  variant="subtle"
                  h="auto"
                  minH="8"
                  py="1"
                  whiteSpace="normal"
                  overflowWrap="anywhere"
                  aria-label={t('removeTopic', { name: topic.name })}
                  onClick={() =>
                    onChange(selectedIds.filter((selected) => selected !== id))
                  }
                >
                  {topic.name}
                  <X aria-hidden />
                </Button>
              );
            })}
          </Flex>
        ) : (
          <Text fontSize="sm" color="fg.muted">
            {t('noTopics')}
          </Text>
        )}
      </Stack>
      {recommended.length > 0 && (
        <Stack gap="2">
          <Text fontSize="sm" fontWeight="medium">
            {t('suggestedTopics')}
          </Text>
          <Flex gap="2" wrap="wrap">
            {recommended.map(renderOption)}
          </Flex>
        </Stack>
      )}
      {(suggestionsLoading || suggestionsUnavailable) && (
        <Text fontSize="sm" color="fg.muted" role="status">
          {t(
            suggestionsLoading
              ? 'loadingSuggestions'
              : 'suggestionsUnavailable',
          )}
        </Text>
      )}
    </Stack>
  );
}
