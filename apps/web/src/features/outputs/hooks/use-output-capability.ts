'use client';

import { useAuthControllerMe } from '@/lib/api';
import {
  resolveOutputCapability,
  type OutputCapability,
} from '@/utils/output-capability';

/**
 * Who the signed-in viewer is on a work, and what they may change.
 *
 * The rule itself lives in `utils/output-capability.ts` because the
 * profile page needs it too, and a rule duplicated across two features is
 * a rule that will drift. This hook only supplies the session.
 *
 * The `GET /me` request is deduplicated by TanStack Query, so asking here
 * costs nothing extra on a page the header already checked. The hook reads
 * the raw generated payload: the domain mapping lives in the identity
 * feature, which this feature must not import.
 */
export function useOutputCapability({
  ownerId,
  authorUserIds,
  groupLeadId,
}: {
  ownerId?: string | null;
  /** The user ids of the linked authors of the work. */
  authorUserIds?: string[];
  /** The lead of the affiliated group, when the work has one. */
  groupLeadId?: string | null;
}): OutputCapability {
  const query = useAuthControllerMe({
    query: { retry: false },
  });

  return resolveOutputCapability({
    userId: query.data?.id ?? null,
    ownerId,
    authorUserIds,
    groupLeadId,
  });
}
