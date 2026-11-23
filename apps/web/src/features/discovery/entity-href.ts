/**
 * The route of a searchable entity.
 *
 * The search index covers four kinds of entity, and each has a screen of
 * its own. A result that cannot be opened is a dead end, so every kind
 * maps to a route here — the one place that knows the mapping.
 */

/**
 * The path of an entity, or `null` when the entity has no screen of its
 * own.
 *
 * @param entityType The kind of entity — `RESEARCHER`, `GROUP`,
 *   `OUTPUT` or `OPPORTUNITY`.
 * @param entityId The entity's id.
 */
export function entityHref(
  entityType: string,
  entityId: string,
): string | null {
  switch (entityType) {
    case 'RESEARCHER':
      return `/profile/${entityId}`;
    case 'GROUP':
      return `/groups/${entityId}`;
    case 'OUTPUT':
      return `/outputs/${entityId}`;
    case 'OPPORTUNITY':
      return `/opportunities/${entityId}`;
    default:
      return null;
  }
}
