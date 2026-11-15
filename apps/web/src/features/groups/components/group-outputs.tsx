'use client';

import { GroupLineSkeleton } from './group-skeletons';

import { useForm, useWatch } from 'react-hook-form';
import {
  Badge,
  Box,
  Button,
  Heading,
  Link,
  Stack,
  Text,
} from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { useCurrentUser } from '@/features/identity';
import {
  useOutputsControllerFindOne,
  useOutputsControllerFindRevisions,
  outputsControllerFindAll,
  groupOutputLinksControllerRequest,
  groupOutputLinksControllerDecide,
  groupOutputLinksControllerRemove,
} from '@/lib/api';
import { ErrorState } from '@/components/ui/feedback';
import { FormSelect } from '@/components/ui/form';
import { useHubCollection } from '../hooks/use-group-hub';
import type { OutputLink } from '../types';
import { HubAction, HubEditor, HubList, HubSection } from './hub-controls';

function OutputCard({
  groupId,
  link,
  review,
  canManage,
}: {
  groupId: string;
  link: OutputLink;
  review: boolean;
  canManage: boolean;
}) {
  const t = useTranslations('groups');
  const output = useOutputsControllerFindOne(link.outputId);
  const revisions = useOutputsControllerFindRevisions(link.outputId, {
    query: { enabled: Boolean(output.data) },
  });
  const revisionId = review
    ? link.requestedRevisionId
    : link.acceptedRevisionId;
  const revision = revisions.data?.find((row) => row.id === revisionId);
  // Never substitute the current release for the revision accepted by the group.
  return (
    <Box borderWidth="1px" borderRadius="md" p="4">
      <Stack gap="3">
        {output.isPending || (output.isSuccess && revisions.isPending) ? (
          <GroupLineSkeleton />
        ) : output.isError || revisions.isError ? (
          <ErrorState
            title={t('outputUnavailable')}
            onRetry={() => {
              void output.refetch();
              void revisions.refetch();
            }}
          />
        ) : !revision ? (
          <ErrorState
            title={t('revisionUnavailable')}
            onRetry={() => void revisions.refetch()}
          />
        ) : (
          <>
            <Heading as="h3" size="md">
              {revision.title}
            </Heading>
            <Text color="fg.muted">
              {t('revision', { number: revision.revisionNo })}
            </Text>
            <Text whiteSpace="pre-wrap">
              {typeof revision.abstract === 'string' ? revision.abstract : null}
            </Text>
            {typeof revision.externalUrl === 'string' &&
            /^https?:\/\//i.test(revision.externalUrl) ? (
              <Link
                href={revision.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('viewOutput')}
              </Link>
            ) : null}
          </>
        )}
        <Badge alignSelf="start">
          {t(`statuses.${review ? link.status : 'ACCEPTED'}`)}
        </Badge>
        {link.decisionNote ? <Text>{link.decisionNote}</Text> : null}
        {canManage ? (
          review ? (
            <Stack direction={{ base: 'column', sm: 'row' }}>
              <HubAction
                groupId={groupId}
                label={t('accept')}
                action={() =>
                  groupOutputLinksControllerDecide(groupId, link.outputId, {
                    status: 'ACCEPTED',
                  })
                }
              />
              <HubAction
                groupId={groupId}
                label={t('reject')}
                confirm
                action={() =>
                  groupOutputLinksControllerDecide(groupId, link.outputId, {
                    status: 'REJECTED',
                  })
                }
              />
            </Stack>
          ) : (
            <HubAction
              groupId={groupId}
              label={t('removeOutput')}
              confirm
              action={() =>
                groupOutputLinksControllerRemove(groupId, link.outputId)
              }
            />
          )
        ) : null}
      </Stack>
    </Box>
  );
}

function LinkOutput({ groupId }: { groupId: string }) {
  const t = useTranslations('groups');
  const user = useCurrentUser();
  const selection = useForm({ defaultValues: { outputId: '' } });
  const outputId = useWatch({ control: selection.control, name: 'outputId' });
  const revisions = useOutputsControllerFindRevisions(outputId, {
    query: { enabled: Boolean(outputId) },
  });
  const outputs = useHubCollection(
    ['group-hub', user?.id, groupId, 'linkable-outputs'],
    Boolean(user),
    (page, signal) =>
      outputsControllerFindAll({ limit: 20, page }, undefined, signal),
  );
  const available =
    outputs.data?.filter(
      (output) =>
        output.sharingStatus === 'SHARED' && output.currentRevision?.releasedAt,
    ) ?? [];
  if (outputs.isPending) return <GroupLineSkeleton />;
  if (outputs.isError)
    return (
      <ErrorState
        title={t('loadError')}
        onRetry={() => void outputs.refetch()}
      />
    );
  return (
    <Stack gap="3">
      <FormSelect
        name="outputId"
        control={selection.control}
        label={t('output')}
      >
        <option value="">{t('chooseOutput')}</option>
        {available.map((output) => (
          <option key={output.id} value={output.id}>
            {output.currentRevision?.title ?? output.id}
          </option>
        ))}
      </FormSelect>
      {outputs.hasNextPage ? (
        <Button
          variant="outline"
          loading={outputs.isFetchingNextPage}
          onClick={() => void outputs.fetchNextPage()}
        >
          {t('loadMore')}
        </Button>
      ) : null}
      {outputId && revisions.isPending ? <GroupLineSkeleton /> : null}
      {outputId && revisions.isError ? (
        <ErrorState
          title={t('loadError')}
          onRetry={() => void revisions.refetch()}
        />
      ) : null}
      {outputId && revisions.data ? (
        <HubEditor
          key={outputId}
          groupId={groupId}
          label={t('linkOutput')}
          title={t('linkOutput')}
          fields={[
            {
              name: 'revisionId',
              label: t('chooseRevision'),
              required: true,
              options: [
                { value: '', label: t('chooseRevision') },
                ...revisions.data
                  .filter((revision) => revision.releasedAt)
                  .map((revision) => ({
                    value: revision.id,
                    label:
                      t('revision', { number: revision.revisionNo }) +
                      ': ' +
                      revision.title,
                  })),
              ],
            },
            {
              name: 'decisionNote',
              label: t('note'),
              type: 'textarea',
              max: 2000,
            },
          ]}
          submit={(values) => {
            return groupOutputLinksControllerRequest(groupId, {
              outputId,
              revisionId: values.revisionId,
              decisionNote: values.decisionNote || null,
            });
          }}
        />
      ) : null}
    </Stack>
  );
}

export function GroupOutputs({
  groupId,
  canManage,
  query,
  pendingQuery,
}: {
  groupId: string;
  canManage: boolean;
  query: Parameters<typeof HubList<OutputLink>>[0]['query'];
  pendingQuery: Parameters<typeof HubList<OutputLink>>[0]['query'];
}) {
  const t = useTranslations('groups');
  return (
    <HubSection title={t('outputs')}>
      {canManage ? <LinkOutput groupId={groupId} /> : null}
      <HubList
        query={{
          ...query,
          data: query.data?.filter((link) => link.status === 'ACCEPTED'),
        }}
      >
        {(links) =>
          links.map((link) => (
            <OutputCard
              key={link.outputId}
              groupId={groupId}
              link={link}
              review={false}
              canManage={canManage}
            />
          ))
        }
      </HubList>
      {canManage ? (
        <>
          <Heading as="h3" size="md">
            {t('reviewQueue')}
          </Heading>
          <HubList
            query={{
              ...pendingQuery,
              data: pendingQuery.data?.filter(
                (link) => link.status === 'PENDING',
              ),
            }}
          >
            {(links) =>
              links.map((link) => (
                <OutputCard
                  key={link.outputId}
                  groupId={groupId}
                  link={link}
                  review
                  canManage
                />
              ))
            }
          </HubList>
        </>
      ) : null}
    </HubSection>
  );
}
