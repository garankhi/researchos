'use client';

import { Badge, Box, Flex, Heading, Link, Stack, Text } from '@chakra-ui/react';
import { useLocale, useTranslations } from 'next-intl';
import NextLink from '@/components/ui/link';
import {
  opportunitiesControllerCreate,
  opportunitiesControllerUpdate,
  opportunitiesControllerOpen,
  opportunitiesControllerFill,
  opportunitiesControllerClose,
} from '@/lib/api';
import type { Opportunity } from '../types';
import type { HubArchive } from '../hooks/use-group-hub';
import {
  HubAction,
  HubEditor,
  HubList,
  HubMenu,
  HubSection,
} from './hub-controls';

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
        ...(!opportunity || opportunity.status === 'DRAFT'
          ? [
              {
                name: 'autoFillOnAcceptance',
                label: t('fillPolicy'),
                initial: String(opportunity?.autoFillOnAcceptance ?? false),
                options: [
                  { value: 'false', label: t('manualFill') },
                  { value: 'true', label: t('singleApplicant') },
                ],
              },
            ]
          : []),
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
          autoFillOnAcceptance:
            values.autoFillOnAcceptance === undefined
              ? undefined
              : values.autoFillOnAcceptance === 'true',
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
  archive,
}: {
  groupId: string;
  canManage: boolean;
  query: Parameters<typeof HubList<Opportunity>>[0]['query'];
  archive?: HubArchive<Opportunity>;
}) {
  const t = useTranslations('groups');
  const locale = useLocale();
  return (
    <HubSection
      title={t('opportunities')}
      archive={archive}
      action={
        canManage && !archive?.showing ? (
          <OpportunityEditor groupId={groupId} />
        ) : null
      }
    >
      <HubList
        query={archive?.showing ? archive.query : query}
        archived={archive?.showing}
      >
        {(items) =>
          items.map((opportunity, index) => (
            <Box
              key={opportunity.id}
              position="relative"
              borderBottomWidth={index < items.length - 1 ? '1px' : '0'}
              borderColor="border"
              pb={index < items.length - 1 ? '4' : '0'}
            >
              <Stack gap="3">
                <Heading as="h3" size="md" pe={canManage ? '8' : '0'}>
                  <Link asChild color="fg">
                    <NextLink href={`/opportunities/${opportunity.id}`}>
                      {opportunity.title}
                    </NextLink>
                  </Link>
                </Heading>
                <Flex gap="2" align="center" flexWrap="wrap">
                  <Badge
                    variant="subtle"
                    colorPalette={
                      opportunity.status === 'OPEN'
                        ? 'green'
                        : opportunity.status === 'FILLED'
                          ? 'blue'
                          : 'gray'
                    }
                  >
                    {t(`statuses.${opportunity.status}`)}
                  </Badge>
                  <Text textStyle="sm" color="fg.muted">
                    {t(`kinds.${opportunity.opportunityKind}`)} ·{' '}
                    {t(`audiences.${opportunity.targetAudience}`)}
                  </Text>
                </Flex>
                {opportunity.description ? (
                  <Text textStyle="sm" color="fg.muted" lineClamp={3}>
                    {opportunity.description}
                  </Text>
                ) : null}
                {opportunity.expectedRole ? (
                  <Text textStyle="sm" color="fg.muted">
                    {t('expectedRole')}: {opportunity.expectedRole}
                  </Text>
                ) : null}
                {opportunity.applicationDeadline ? (
                  <Text textStyle="sm" color="fg.muted">
                    {t('deadline', {
                      date: new Date(
                        opportunity.applicationDeadline,
                      ).toLocaleString(locale),
                    })}
                  </Text>
                ) : null}
                {archive?.showing && canManage && opportunity.canManage ? (
                  <HubMenu positioned>
                    <HubAction
                      groupId={groupId}
                      label={t('restoreOpportunity')}
                      confirm
                      action={() =>
                        opportunitiesControllerUpdate(opportunity.id, {
                          archivedAt: null,
                        })
                      }
                    />
                  </HubMenu>
                ) : canManage &&
                  opportunity.canManage === true &&
                  !opportunity.archivedAt ? (
                  <HubMenu positioned>
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
                      danger
                      action={() =>
                        opportunitiesControllerUpdate(opportunity.id, {
                          archivedAt: new Date().toISOString(),
                        })
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
