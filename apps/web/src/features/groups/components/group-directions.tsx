'use client';

import { GroupLineSkeleton } from './group-skeletons';

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
import { ErrorState } from '@/components/ui/feedback';
import type { Direction } from '../types';
import {
  HubAction,
  HubForm,
  HubList,
  HubMenu,
  HubModal,
  HubSection,
} from './hub-controls';

function DirectionEditor({
  groupId,
  direction,
}: {
  groupId: string;
  direction?: Direction;
}) {
  const t = useTranslations('groups');
  return (
    <HubModal
      label={direction ? t('edit') : t('publishDirection')}
      title={direction ? t('editDirection') : t('publishDirection')}
    >
      {(close) => (
        <DirectionForm
          groupId={groupId}
          direction={direction}
          onSaved={close}
        />
      )}
    </HubModal>
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
        <GroupLineSkeleton />
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
    <HubSection
      title={t('directions')}
      action={canPublish ? <DirectionEditor groupId={groupId} /> : null}
    >
      <HubList query={query}>
        {(directions) =>
          directions.map((direction, index) => (
            <Box
              key={direction.id}
              position="relative"
              borderBottomWidth={index < directions.length - 1 ? '1px' : '0'}
              borderColor="border"
              pb={index < directions.length - 1 ? '4' : '0'}
            >
              <Stack gap="3">
                <Heading as="h3" size="md" pe={canEdit ? '8' : '0'}>
                  {direction.title}
                </Heading>
                {direction.topicPath ? (
                  <Text textStyle="sm" color="fg.muted">
                    {[
                      direction.topicPath.field.name,
                      direction.topicPath.subfield.name,
                      direction.topicPath.topic.name,
                    ].join(' / ')}
                  </Text>
                ) : null}
                {direction.description ? (
                  <Text textStyle="sm" color="fg.muted" lineClamp={3}>
                    {direction.description}
                  </Text>
                ) : null}
                {canEdit ? (
                  <HubMenu positioned>
                    <DirectionEditor groupId={groupId} direction={direction} />
                    <HubAction
                      groupId={groupId}
                      label={t('removeDirection')}
                      confirm
                      danger
                      action={() =>
                        groupDirectionsControllerRemove(groupId, direction.id)
                      }
                    />
                  </HubMenu>
                ) : null}
              </Stack>
            </Box>
          ))
        }
      </HubList>
    </HubSection>
  );
}
