/**
 * Domain types for the follow feature.
 *
 * Derived from the generated API models but kept separate, so a backend
 * field rename surfaces here first.
 */

import type {
  FollowDto,
  FollowEntityType,
} from '@/lib/api/models';

/**
 * The kinds of entity a researcher can follow.
 *
 * The backend's `entity_types` enum carries five values, but only three are
 * followable today: `PROJECT` and `OUTPUT` are reserved and the API answers
 * `follow_target_type_unsupported` for them.
 */
export const FOLLOWABLE_ENTITY_TYPES = ['RESEARCHER', 'GROUP', 'TOPIC'] as const;

/** A followable entity type. */
export type FollowableEntityType = (typeof FOLLOWABLE_ENTITY_TYPES)[number];

/** One followed entity, as the API reports it. */
export interface Follow {
  entityType: FollowEntityType;
  entityId: string;
  /** When the follow was created. */
  followedAt: string;
  /** The entity's current display name. */
  displayName: string;
  /** The researcher availability, or `ACTIVE` for a group or a topic. */
  state: string;
}

/** The payload of a page of followed entities. */
export interface FollowPage {
  items: Follow[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

/**
 * The identity of one followable entity.
 *
 * A detail view knows the entity's type and id; the follow feature needs
 * nothing else to decide whether the caller already follows it.
 */
export interface FollowTarget {
  entityType: FollowableEntityType;
  entityId: string;
}

export type { FollowDto, FollowEntityType };
