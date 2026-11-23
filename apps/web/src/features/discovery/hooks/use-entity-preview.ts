'use client';

import {
  useGroupsControllerPreview,
  useProfilesControllerGetPreviewById,
} from '@/lib/api';
import type { PreviewableEntityType } from '../entity-types';

/**
 * The quick information the hover card shows about a group.
 */
export interface GroupPreview {
  kind: 'GROUP';
  name: string;
  description: string | null;
  directions: {
    title: string;
    topic: string | null;
  }[];
}

/**
 * The quick information the hover card shows about a researcher.
 */
export interface ResearcherPreview {
  kind: 'RESEARCHER';
  fullName: string;
  departmentUnit: string;
  academicTitle: string | null;
  academicDegree: string | null;
  bio: string | null;
  avatarStorageKey: string | null;
}

/**
 * The preview data of an entity, or `null` when the entity has no
 * preview.
 */
export type EntityPreview = GroupPreview | ResearcherPreview | null;

/**
 * The preview state of an entity.
 *
 * `isLoading` covers the first fetch only — a preview that is already on
 * screen stays there while a background refetch settles.
 */
export interface EntityPreviewState {
  preview: EntityPreview;
  isLoading: boolean;
  isFailed: boolean;
}

/**
 * Fetches the quick information a hover card needs about an entity.
 *
 * The request only starts once the reader asks for it — the card mounts
 * on hover — so a feed full of links does not fetch a preview for every
 * one of them up front.
 *
 * @param entityType The kind of entity to preview.
 * @param entityId The entity's id.
 * @param enabled Whether the preview should be fetched at all.
 */
export function useEntityPreview(
  entityType: PreviewableEntityType,
  entityId: string,
  enabled: boolean,
): EntityPreviewState {
  const groupQuery = useGroupsControllerPreview(entityId, {
    query: { enabled: enabled && entityType === 'GROUP' },
  });

  const profileQuery = useProfilesControllerGetPreviewById(entityId, {
    query: { enabled: enabled && entityType === 'RESEARCHER' },
  });

  if (entityType === 'GROUP') {
    const data = groupQuery.data;

    return {
      preview: data
        ? {
            kind: 'GROUP',
            name: data.name,
            description: data.description,
            directions: data.directions,
          }
        : null,
      isLoading: groupQuery.isPending && groupQuery.fetchStatus !== 'idle',
      isFailed: groupQuery.isError,
    };
  }

  const data = profileQuery.data;

  return {
    preview: data
      ? {
          kind: 'RESEARCHER',
          fullName: data.fullName,
          departmentUnit: data.departmentUnit,
          academicTitle: data.academicTitle,
          academicDegree: data.academicDegree,
          bio: data.bio,
          avatarStorageKey: data.avatarStorageKey,
        }
      : null,
    isLoading: profileQuery.isPending && profileQuery.fetchStatus !== 'idle',
    isFailed: profileQuery.isError,
  };
}
