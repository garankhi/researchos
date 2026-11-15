'use client';

import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Box, Button, Heading, Stack, Text } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import {
  useTaxonomyControllerFindAllTopics,
  useTaxonomyControllerFindOneTopic,
  groupDirectionsControllerCreate,
  groupDirectionsControllerUpdate,
  groupDirectionsControllerRemove,
} from '@/lib/api';
import { FormTextField } from '@/components/ui/form';
import { ErrorState, LoadingSkeleton } from '@/components/ui/feedback';
import type { Direction } from '../types';
import { HubAction, HubForm, HubList, HubSection } from './hub-controls';

function DirectionEditor({
  groupId,
  direction,
}: {
  groupId: string;
  direction?: Direction;
}) {
  const t = useTranslations('groups');
  const [open, setOpen] = useState(false);
  return (
    <Stack gap="3">
      <Button
        alignSelf="start"
        variant="outline"
        onClick={() => setOpen(!open)}
      >
        {open ? t('cancel') : direction ? t('edit') : t('publishDirection')}
      </Button>
      {open ? (
        <DirectionForm
          groupId={groupId}
          direction={direction}
          onSaved={() => setOpen(false)}
        />
      ) : null}
    </Stack>
  );
}

function DirectionForm({
  groupId,
  direction,
  onSaved,
}: {
  groupId: string;
  direction?: Direction;
  onSaved: () => void;
}) {
  const t = useTranslations('groups');
  const [topicId, setTopicId] = useState<string | null>(
    direction?.topicId ?? null,
  );
  const [topicLabel, setTopicLabel] = useState(
    direction?.topicPath?.topic.name ?? '',
  );
  const search = useForm({ defaultValues: { search: '' } });
  const term = useWatch({ control: search.control, name: 'search' });
  const topics = useTaxonomyControllerFindAllTopics({
    search: term.trim() || undefined,
    limit: 20,
    isActive: true,
  });
  const selectedTopic = useTaxonomyControllerFindOneTopic(topicId ?? '', {
    query: { enabled: Boolean(topicId && !topicLabel) },
  });
  return (
    <HubForm
      groupId={groupId}
      onSaved={onSaved}
      title={direction ? t('editDirection') : t('publishDirection')}
      fields={[
        {
          name: 'title',
          label: t('title'),
          initial: direction?.title,
          required: true,
          max: 255,
        },
        {
          name: 'description',
          label: t('description'),
          initial: direction?.description ?? '',
          type: 'textarea',
          max: 10000,
        },
      ]}
      submit={(values) => {
        const data = {
          title: values.title,
          description: values.description || null,
          topicId,
        };
        return direction
          ? groupDirectionsControllerUpdate(groupId, direction.id, data)
          : groupDirectionsControllerCreate(groupId, data);
      }}
    >
      <FormTextField
        name="search"
        label={t('searchTopics')}
        control={search.control}
      />
      <Text>
        {t('selectedTopic', {
          topic: topicLabel || selectedTopic.data?.name || t('noTopic'),
        })}
      </Text>
      <Button
        variant="ghost"
        alignSelf="start"
        onClick={() => {
          setTopicId(null);
          setTopicLabel('');
        }}
      >
        {t('clearTopic')}
      </Button>
      {topics.isPending ? (
        <LoadingSkeleton />
      ) : topics.isError ? (
        <ErrorState
          title={t('loadError')}
          onRetry={() => void topics.refetch()}
        />
      ) : (
        <Stack maxH="200px" overflowY="auto">
          {topics.data?.items.map((topic) => (
            <Button
              key={topic.id}
              variant={topic.id === topicId ? 'solid' : 'outline'}
              whiteSpace="normal"
              h="auto"
              minH="10"
              onClick={() => {
                setTopicId(topic.id);
                setTopicLabel(topic.name);
              }}
            >
              {topic.name}
            </Button>
          ))}
        </Stack>
      )}
    </HubForm>
  );
}

export function GroupDirections({
  groupId,
  canPublish,
  canEdit,
  query,
}: {
  groupId: string;
  canPublish: boolean;
  canEdit: boolean;
  query: Parameters<typeof HubList<Direction>>[0]['query'];
}) {
  const t = useTranslations('groups');
  return (
    <HubSection title={t('directions')}>
      {canPublish ? <DirectionEditor groupId={groupId} /> : null}
      <HubList query={query}>
        {(directions) =>
          directions.map((direction) => (
            <Box key={direction.id} borderWidth="1px" borderRadius="md" p="4">
              <Stack gap="3">
                <Heading as="h3" size="md">
                  {direction.title}
                </Heading>
                {direction.topicPath ? (
                  <Text color="fg.muted">
                    {[
                      direction.topicPath.field.name,
                      direction.topicPath.subfield.name,
                      direction.topicPath.topic.name,
                    ].join(' / ')}
                  </Text>
                ) : null}
                <Text whiteSpace="pre-wrap">{direction.description}</Text>
                {canEdit ? (
                  <>
                    <DirectionEditor groupId={groupId} direction={direction} />
                    <HubAction
                      groupId={groupId}
                      label={t('removeDirection')}
                      confirm
                      action={() =>
                        groupDirectionsControllerRemove(groupId, direction.id)
                      }
                    />
                  </>
                ) : null}
              </Stack>
            </Box>
          ))
        }
      </HubList>
    </HubSection>
  );
}
