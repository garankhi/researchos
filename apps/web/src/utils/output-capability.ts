/**
 * Who may change a work's audience.
 *
 * The backend owns this rule — `can_change_output_visibility` in the
 * database's feature functions — and it reports the answer on the work
 * itself as `canChangeVisibility`. The frontend reads that flag, so the
 * UI can say "you cannot change this" *before* a save is attempted
 * instead of opening an editable dialog that then fails with a 403.
 *
 * The local rules below answer the questions the flag cannot: *what* the
 * viewer is in relation to the work (the owner is still the owner when
 * they may not change the audience), and which audiences the scope of
 * the work allows at all.
 */

/**
 * The posting context of a work.
 *
 * The scope decides who owns the work and therefore who may change its
 * audience. It never changes after creation.
 */
export type OutputScopeType = 'PERSONAL' | 'GROUP' | 'PROJECT';

/**
 * Who may read a work.
 *
 * `PRIVATE` is the owner-only draft, `CONTAINER` is the narrow audience of
 * the group or the project, and `FPTU_COMMUNITY` is every signed-in
 * researcher.
 */
export type OutputAudience = 'PRIVATE' | 'CONTAINER' | 'FPTU_COMMUNITY';

export type OutputViewerRole = 'owner' | 'author' | 'reader';

/**
 * What the viewer may do with a work.
 */
export interface OutputCapability {
  /** The signed-in account id, or `null` when signed out. */
  userId: string | null;
  /** The viewer's relationship to the work. */
  role: OutputViewerRole;
  isOwner: boolean;
  isAuthor: boolean;
  /** Whether the viewer may change the work's audience. */
  canChangeVisibility: boolean;
  /** The audiences the scope of the work allows. */
  allowedAudiences: readonly OutputAudience[];
}

/**
 * The audiences a work of the given scope may take.
 *
 * A personal work has two: PRIVATE (the owner-only draft) and
 * FPTU_COMMUNITY. A container work has two as well: CONTAINER (the narrow
 * audience of the group or project) and FPTU_COMMUNITY. There is never a
 * third layer.
 */
export function allowedOutputAudiences(
  scopeType: OutputScopeType,
): readonly OutputAudience[] {
  return scopeType === 'PERSONAL'
    ? ['PRIVATE', 'FPTU_COMMUNITY']
    : ['CONTAINER', 'FPTU_COMMUNITY'];
}

/**
 * Resolves the viewer's relationship to a work.
 *
 * `canChangeVisibility` comes from the server: the authority follows the
 * scope of the work, and re-implementing that rule in the browser is how
 * two answers to the same question drift apart.
 */
export function resolveOutputCapability({
  userId,
  ownerId,
  authorUserIds,
  scopeType,
  canChangeVisibility,
}: {
  /** The signed-in account id, or `null` when signed out. */
  userId?: string | null;
  ownerId?: string | null;
  /** The user ids of the linked authors of the work. */
  authorUserIds?: string[];
  /** Where the work was posted. */
  scopeType?: OutputScopeType;
  /** The server's answer: may this viewer change the audience? */
  canChangeVisibility?: boolean;
}): OutputCapability {
  const audiences = allowedOutputAudiences(scopeType ?? 'PERSONAL');

  if (!userId) {
    return {
      userId: null,
      role: 'reader',
      isOwner: false,
      isAuthor: false,
      canChangeVisibility: false,
      allowedAudiences: audiences,
    };
  }

  const isOwner = Boolean(ownerId && ownerId === userId);
  const isAuthor = Boolean(authorUserIds?.includes(userId));

  return {
    userId,
    role: isOwner ? 'owner' : isAuthor ? 'author' : 'reader',
    isOwner,
    isAuthor,
    canChangeVisibility: Boolean(canChangeVisibility),
    allowedAudiences: audiences,
  };
}
