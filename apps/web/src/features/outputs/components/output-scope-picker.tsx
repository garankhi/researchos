'use client';

import { useId, useMemo, useState } from 'react';
import { Badge, Box, NativeSelect, Stack, Text } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { useCurrentUser } from '@/features/identity';
import { useGroupsControllerFindAll } from '@/lib/api';
import { useProjectsControllerFindAll } from '@/lib/api';
import type { OutputScopeDtoScopeType } from '@/lib/api/models/outputScopeDtoScopeType';

/**
 * The posting context of a work, chosen before it is written.
 *
 * The scope decides two things at once: who owns the work — and so who
 * may change its audience later — and who may read it now. It is fixed
 * at creation, because moving a work to another container would
 * silently change who may edit it.
 *
 * The picker offers only the containers the caller can actually post
 * into: their own groups and the projects they reach. A personal post is
 * always available and needs no container.
 */
export interface OutputScopeSelection {
  scopeType: OutputScopeDtoScopeType;
  scopeGroupId?: string;
  scopeProjectId?: string;
}

export function OutputScopePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: OutputScopeSelection;
  onChange: (next: OutputScopeSelection) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('outputScope');
  const user = useCurrentUser();
  const scopeId = useId();
  const groupId = useId();
  const projectId = useId();
  const [groupIdValue, setGroupIdValue] = useState('');
  const [projectIdValue, setProjectIdValue] = useState('');

  const groupsQuery = useGroupsControllerFindAll(
    { memberId: user?.id, limit: 100 },
    {
      query: {
        enabled: !disabled && Boolean(user?.id),
        staleTime: 60 * 1000,
      },
    },
  );

  const projectsQuery = useProjectsControllerFindAll(
    { limit: 100 },
    {
      query: {
        enabled: !disabled,
        staleTime: 60 * 1000,
      },
    },
  );

  const groups = useMemo(
    () => groupsQuery.data?.items ?? [],
    [groupsQuery.data],
  );
  const projects = useMemo(
    () => projectsQuery.data?.items ?? [],
    [projectsQuery.data],
  );

  const scopeItems = useMemo(() => {
    const items: { label: string; value: OutputScopeDtoScopeType }[] = [
      { label: t('personalOption'), value: 'PERSONAL' },
    ];
    if (groups.length > 0) {
      items.push({ label: t('groupOption'), value: 'GROUP' });
    }
    if (projects.length > 0) {
      items.push({ label: t('projectOption'), value: 'PROJECT' });
    }
    return items;
  }, [groups.length, projects.length, t]);

  function changeScope(next: OutputScopeDtoScopeType) {
    if (next === 'PERSONAL') {
      onChange({ scopeType: 'PERSONAL' });
      return;
    }
    if (next === 'GROUP') {
      onChange({
        scopeType: 'GROUP',
        scopeGroupId: groupIdValue || groups[0]?.id,
      });
      return;
    }
    onChange({
      scopeType: 'PROJECT',
      scopeProjectId: projectIdValue || projects[0]?.id,
    });
  }

  return (
    <Stack gap="3">
      <Box>
        <Text asChild textStyle="sm" fontWeight="bold" mb="1">
          <label htmlFor={scopeId}>{t('label')}</label>
        </Text>
        <Text textStyle="sm" color="fg.muted">
          {t('hint')}
        </Text>
      </Box>

      <NativeSelect.Root size="sm" disabled={disabled}>
        <NativeSelect.Field
          id={scopeId}
          value={value.scopeType}
          onChange={(event) =>
            changeScope(event.currentTarget.value as OutputScopeDtoScopeType)
          }
        >
          {scopeItems.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>

      {value.scopeType === 'GROUP' && groups.length > 0 ? (
        <NativeSelect.Root size="sm" disabled={disabled}>
          <NativeSelect.Field
            id={groupId}
            aria-label={t('groupOption')}
            value={value.scopeGroupId ?? groups[0]?.id}
            onChange={(event) => {
              const next = event.currentTarget.value;
              setGroupIdValue(next);
              onChange({ scopeType: 'GROUP', scopeGroupId: next });
            }}
          >
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      ) : null}

      {value.scopeType === 'PROJECT' && projects.length > 0 ? (
        <NativeSelect.Root size="sm" disabled={disabled}>
          <NativeSelect.Field
            id={projectId}
            aria-label={t('projectOption')}
            value={value.scopeProjectId ?? projects[0]?.id}
            onChange={(event) => {
              const next = event.currentTarget.value;
              setProjectIdValue(next);
              onChange({ scopeType: 'PROJECT', scopeProjectId: next });
            }}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      ) : null}

      {value.scopeType !== 'PERSONAL' ? (
        <Badge variant="subtle" colorPalette="blue" alignSelf="flex-start">
          {t('containerNote')}
        </Badge>
      ) : null}

      <Text textStyle="xs" color="fg.muted">
        {t('fixedNote')}
      </Text>
    </Stack>
  );
}
