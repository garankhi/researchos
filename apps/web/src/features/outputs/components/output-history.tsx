'use client';

import { Badge, Box, Flex, Heading, Stack, Text } from '@chakra-ui/react';
import { History } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { useOutputRevisionHistory } from '../hooks/use-output-revision-history';
import type {
  OutputRevisionChange,
  OutputRevisionHistoryEntry,
} from '../types';
import { OutputHistorySkeleton } from './output-skeletons';

/**
 * The fields the history compares.
 *
 * The key is stable and machine-readable, so the label of a changed field
 * is resolved from the message catalog rather than shown raw.
 */
const KNOWN_CHANGE_FIELDS = new Set([
  'title',
  'abstract',
  'venue',
  'publisher',
  'publicationDate',
  'volume',
  'issue',
  'pages',
  'peerReviewed',
  'externalUrl',
  'authors',
]);

/**
 * The edit history of a work.
 *
 * Every revision of a work is kept, and each one records who wrote it and
 * who released it. This reads that record back as a timeline: the newest
 * revision first, each entry listing the fields it changed compared with
 * the revision before it.
 */
export function OutputHistory({ outputId }: { outputId: string }) {
  const t = useTranslations('outputs');
  const { entries, isLoading, isFailed, refetch } = useOutputRevisionHistory({
    outputId,
  });

  return (
    <Box minW="0" bg="bg.panel" boxShadow="xs">
      <Flex
        px={{ base: '4', md: '6' }}
        py="4"
        borderBottomWidth="1px"
        borderColor="border"
        align="center"
        gap="2"
      >
        <History size={18} aria-hidden />
        <Heading as="h2" size="md" fontWeight="bold">
          {t('detail.historyTitle')}
        </Heading>
      </Flex>

      <Box p={{ base: '4', md: '6' }}>
        {isLoading ? (
          <OutputHistorySkeleton />
        ) : isFailed ? (
          <ErrorState
            title={t('detail.historyLoadError')}
            onRetry={() => void refetch()}
          />
        ) : !entries || entries.length === 0 ? (
          <EmptyState
            title={t('detail.historyEmptyTitle')}
            message={t('detail.historyEmptyMessage')}
          />
        ) : (
          <Stack gap="3">
            {entries.map((entry) => (
              <HistoryEntry key={entry.id} entry={entry} />
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  );
}

function HistoryEntry({ entry }: { entry: OutputRevisionHistoryEntry }) {
  const t = useTranslations('outputs.detail');
  const format = useFormatter();

  const when = entry.releasedAt ?? entry.createdAt;
  const parsed = new Date(when);
  const whenLabel = Number.isNaN(parsed.getTime())
    ? null
    : format.dateTime(parsed, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <Box
      p="4"
      borderWidth="1px"
      borderColor="border"
      borderRadius="md"
      bg="bg.subtle"
    >
      <Flex align="center" gap="2" wrap="wrap">
        <Badge variant="solid" colorPalette="blue">
          {t('historyRevisionLabel', { number: entry.revisionNo })}
        </Badge>
        {entry.isCurrent ? (
          <Badge variant="subtle" colorPalette="green">
            {t('historyCurrentBadge')}
          </Badge>
        ) : null}
        {entry.releasedAt ? null : (
          <Badge variant="subtle" colorPalette="gray">
            {t('historyDraftBadge')}
          </Badge>
        )}
      </Flex>

      <Text fontWeight="medium" mt="2">
        {entry.title}
      </Text>

      <Text textStyle="sm" color="fg.muted" mt="1">
        {t('historyByLine', { name: entry.createdBy.fullName })}
        {whenLabel ? ` · ${whenLabel}` : ''}
      </Text>

      {entry.changes.length > 0 ? (
        <Stack gap="2" mt="3">
          {entry.changes.map((change) => (
            <ChangeRow key={change.field} change={change} />
          ))}
        </Stack>
      ) : (
        <Text textStyle="sm" color="fg.muted" mt="2">
          {t('historyNoChanges')}
        </Text>
      )}
    </Box>
  );
}

function ChangeRow({ change }: { change: OutputRevisionChange }) {
  const t = useTranslations('outputs.detail');
  const label = KNOWN_CHANGE_FIELDS.has(change.field)
    ? t(`historyFields.${change.field}`)
    : change.field;

  return (
    <Box
      p="3"
      bg="bg.panel"
      borderWidth="1px"
      borderColor="border"
      borderRadius="sm"
    >
      <Text textStyle="sm" fontWeight="medium">
        {label}
      </Text>
      <Flex gap="2" mt="1" align="baseline" wrap="wrap">
        {change.previousValue ? (
          <Text textStyle="sm" color="fg.muted" textDecoration="line-through">
            {change.previousValue}
          </Text>
        ) : (
          <Text textStyle="sm" color="fg.muted">
            {t('historyEmptyValue')}
          </Text>
        )}
        <Text textStyle="sm" color="fg.muted" aria-hidden>
          →
        </Text>
        {change.currentValue ? (
          <Text textStyle="sm">{change.currentValue}</Text>
        ) : (
          <Text textStyle="sm" color="fg.muted">
            {t('historyEmptyValue')}
          </Text>
        )}
      </Flex>
    </Box>
  );
}
