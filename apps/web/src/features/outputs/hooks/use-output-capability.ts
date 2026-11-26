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
 * Whether the viewer may change the audience comes from the server: the
 * authority follows the scope of the work, so the backend settles it and
 * reports it on the work.
 *
 * The `GET /me` request is deduplicated by TanStack Query, so asking here
 * costs nothing extra on a page the header already checked. The hook reads
 * the raw generated payload: the domain mapping lives in the identity
 * feature, which this feature must not import.
 */
export function useOutputCapability({
  ownerId,
  authorUserIds,
  scopeType,
  canChangeVisibility,
}: {
  ownerId?: string | null;
  /** The user ids of the linked authors of the work. */
  authorUserIds?: string[];
  /** Where the work was posted. */
  scopeType?: 'PERSONAL' | 'GROUP' | 'PROJECT';
  /** The server's answer: may this viewer change the audience? */
  canChangeVisibility?: boolean;
}): OutputCapability {
  const query = useAuthControllerMe({
    query: { retry: false },
  });

  return resolveOutputCapability({
    userId: query.data?.id ?? null,
    ownerId,
    authorUserIds,
    scopeType,
    canChangeVisibility,
  });
}
