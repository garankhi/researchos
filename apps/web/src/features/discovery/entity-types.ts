/**
 * The kinds of entity a link can point at.
 *
 * The search index covers four kinds, and each has a screen of its own.
 * A link to a kind with no preview still navigates — the preview is an
 * enhancement, not the destination.
 */
export type EntityType = 'RESEARCHER' | 'GROUP' | 'OUTPUT' | 'OPPORTUNITY';

/**
 * Whether a kind of entity has a hover preview.
 *
 * Only a group and a researcher carry enough of their own detail to be
 * worth previewing. An output and an opportunity are read in place, so
 * their link stays a plain link.
 */
export type PreviewableEntityType = 'GROUP' | 'RESEARCHER';

/**
 * Narrows an entity type to the kinds that have a preview.
 *
 * @param entityType The kind of entity.
 */
export function isPreviewable(
  entityType: string,
): entityType is PreviewableEntityType {
  return entityType === 'GROUP' || entityType === 'RESEARCHER';
}
