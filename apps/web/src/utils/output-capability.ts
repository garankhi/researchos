/**
 * Who may change a work's visibility.
 *
 * The backend owns this rule — `can_change_output_visibility` in the
 * database's feature functions — and this is the frontend's mirror of it,
 * so the UI can say "you cannot change this" *before* a save is attempted
 * instead of opening an editable dialog that then fails with a 403.
 *
 * Two features need it (the output detail page and the profile card), so
 * it lives here rather than inside one of them: a rule duplicated across
 * two features is a rule that will drift.
 *
 * The rule: the owner always may; so may the lead of the affiliated
 * group, because a group keeps control of the works carrying its banner.
 * A co-author may not — being listed as an author is a credit, not an
 * ownership.
 */

export type OutputViewerRole = 'owner' | 'groupLead' | 'author' | 'reader';

/**
 * What the viewer may do with a work.
 */
export interface OutputCapability {
  /** The signed-in account id, or `null` when signed out. */
  userId: string | null;
  /** The viewer's relationship to the work. */
  role: OutputViewerRole;
  isOwner: boolean;
  isGroupLead: boolean;
  isAuthor: boolean;
  /** Whether the viewer may change the work's visibility. */
  canChangeVisibility: boolean;
}

/**
 * Resolves the viewer's relationship to a work.
 *
 * `groupLeadId` is the lead of the *affiliated* group — the one the work
 * carries — and it is passed in rather than looked up, because the
 * affiliation is the only group whose lead has a say. A lead of some
 * other group has no claim on the work.
 */
export function resolveOutputCapability({
  userId,
  ownerId,
  authorUserIds,
  groupLeadId,
}: {
  /** The signed-in account id, or `null` when signed out. */
  userId?: string | null;
  ownerId?: string | null;
  /** The user ids of the linked authors of the work. */
  authorUserIds?: string[];
  /** The lead of the affiliated group, when the work has one. */
  groupLeadId?: string | null;
}): OutputCapability {
  if (!userId) {
    return {
      userId: null,
      role: 'reader',
      isOwner: false,
      isGroupLead: false,
      isAuthor: false,
      canChangeVisibility: false,
    };
  }

  const isOwner = Boolean(ownerId && ownerId === userId);
  const isGroupLead = Boolean(
    !isOwner && groupLeadId && groupLeadId === userId,
  );
  const isAuthor = Boolean(authorUserIds?.includes(userId));

  return {
    userId,
    role: isOwner
      ? 'owner'
      : isGroupLead
        ? 'groupLead'
        : isAuthor
          ? 'author'
          : 'reader',
    isOwner,
    isGroupLead,
    isAuthor,
    canChangeVisibility: isOwner || isGroupLead,
  };
}
