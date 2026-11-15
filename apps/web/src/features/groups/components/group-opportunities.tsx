'use client';

import { Badge, Box, Heading, Stack, Text } from '@chakra-ui/react';
import { useLocale, useTranslations } from 'next-intl';
import {
  opportunitiesControllerCreate,
  opportunitiesControllerUpdate,
  opportunitiesControllerOpen,
  opportunitiesControllerFill,
  opportunitiesControllerClose,
} from '@/lib/api';
import type { Opportunity } from '../types';
import { HubAction, HubEditor, HubList, HubSection } from './hub-controls';

function localDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function OpportunityEditor({
  groupId,
  opportunity,
}: {
  groupId: string;
  opportunity?: Opportunity;
}) {
  const t = useTranslations('groups');
  return (
    <HubEditor
      groupId={groupId}
      label={opportunity ? t('edit') : t('createOpportunity')}
      title={opportunity ? t('editOpportunity') : t('createOpportunity')}
      fields={[
        {
          name: 'title',
          label: t('title'),
          initial: opportunity?.title,
          required: true,
          max: 255,
        },
        {
          name: 'description',
          label: t('description'),
          initial: opportunity?.description ?? '',
          type: 'textarea',
        },
        {
          name: 'opportunityKind',
          label: t('kind'),
          initial: opportunity?.opportunityKind ?? 'RESEARCH_COLLABORATION',
          options: (
            [
              'RESEARCH_COLLABORATION',
              'PROJECT_FORMATION',
              'DATA_METHOD_EXCHANGE',
              'FUNDING_CALL',
            ] as const
          ).map((value) => ({ value, label: t(`kinds.${value}`) })),
        },
        {
          name: 'targetAudience',
          label: t('audience'),
          initial: opportunity?.targetAudience ?? 'ANY_RESEARCHER',
          options: (['FACULTY', 'STUDENT', 'ANY_RESEARCHER'] as const).map(
            (value) => ({ value, label: t(`audiences.${value}`) }),
          ),
        },
        {
          name: 'expectedRole',
          label: t('expectedRole'),
          initial: opportunity?.expectedRole ?? '',
          max: 255,
        },
        {
          name: 'requiredExpertiseTags',
          label: t('expertiseTags'),
          initial: opportunity?.requiredExpertiseTags.join(', '),
        },
        {
          name: 'responseSlaDays',
          label: t('slaDays'),
          initial: String(opportunity?.responseSlaDays ?? 7),
          type: 'number',
          required: true,
        },
        {
          name: 'applicationDeadline',
          label: t('deadlineLocal'),
          initial: localDateTime(opportunity?.applicationDeadline ?? null),
          type: 'datetime-local',
        },
      ]}
      submit={(values) => {
        const data = {
          title: values.title,
          description: values.description || null,
          opportunityKind:
            values.opportunityKind as Opportunity['opportunityKind'],
          targetAudience:
            values.targetAudience as Opportunity['targetAudience'],
          expectedRole: values.expectedRole || null,
          requiredExpertiseTags: values.requiredExpertiseTags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
          responseSlaDays: Number(values.responseSlaDays),
          applicationDeadline: values.applicationDeadline
            ? new Date(values.applicationDeadline).toISOString()
            : null,
        };
        return opportunity
          ? opportunitiesControllerUpdate(opportunity.id, data)
          : opportunitiesControllerCreate({ ...data, groupId });
      }}
    />
  );
}

export function GroupOpportunities({
  groupId,
  canManage,
  query,
}: {
  groupId: string;
  canManage: boolean;
  query: Parameters<typeof HubList<Opportunity>>[0]['query'];
}) {
  const t = useTranslations('groups');
  const locale = useLocale();
  return (
    <HubSection title={t('opportunities')}>
      {canManage ? <OpportunityEditor groupId={groupId} /> : null}
      <HubList query={query}>
        {(items) =>
          items.map((opportunity) => (
            <Box key={opportunity.id} borderWidth="1px" borderRadius="md" p="4">
              <Stack gap="3">
                <Heading as="h3" size="md">
                  {opportunity.title}
                </Heading>
                <Badge alignSelf="start">
                  {t(`statuses.${opportunity.status}`)}
                </Badge>
                <Text color="fg.muted">
                  {t(`kinds.${opportunity.opportunityKind}`)} ·{' '}
                  {t(`audiences.${opportunity.targetAudience}`)}
                </Text>
                <Text whiteSpace="pre-wrap">{opportunity.description}</Text>
                {opportunity.expectedRole ? (
                  <Text>
                    {t('expectedRole')}: {opportunity.expectedRole}
                  </Text>
                ) : null}
                <Text>{opportunity.requiredExpertiseTags.join(' · ')}</Text>
                {opportunity.applicationDeadline ? (
                  <Text>
                    {t('deadline', {
                      date: new Date(
                        opportunity.applicationDeadline,
                      ).toLocaleString(locale),
                    })}
                  </Text>
                ) : null}
                {opportunity.canManage === true && !opportunity.archivedAt ? (
                  <>
                    <OpportunityEditor
                      groupId={groupId}
                      opportunity={opportunity}
                    />
                    {opportunity.status === 'DRAFT' ? (
                      <HubAction
                        groupId={groupId}
                        label={t('openOpportunity')}
                        action={() =>
                          opportunitiesControllerOpen(opportunity.id)
                        }
                      />
                    ) : null}
                    {opportunity.status === 'OPEN' ? (
                      <HubAction
                        groupId={groupId}
                        label={t('fillOpportunity')}
                        confirm
                        action={() =>
                          opportunitiesControllerFill(opportunity.id)
                        }
                      />
                    ) : null}
                    {opportunity.status === 'FILLED' ? (
                      <HubAction
                        groupId={groupId}
                        label={t('closeOpportunity')}
                        confirm
                        action={() =>
                          opportunitiesControllerClose(opportunity.id)
                        }
                      />
                    ) : null}
                    <HubAction
                      groupId={groupId}
                      label={t('archiveOpportunity')}
                      confirm
                      action={() =>
                        opportunitiesControllerUpdate(opportunity.id, {
                          archivedAt: new Date().toISOString(),
                        })
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
