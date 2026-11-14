'use client';

import { useAuthControllerMe } from '@/lib/api';

/**
 * Owner check for the output detail page.
 *
 * The `GET /me` request is deduplicated by TanStack Query, so asking here
 * costs nothing extra on a page the header already checked. The hook reads
 * the raw generated payload: the domain mapping lives in the identity
 * feature, which this feature must not import.
 */
export function useOutputOwner({ ownerId }: { ownerId?: string | null }) {
  const query = useAuthControllerMe({
    query: { retry: false },
  });

  const userId = query.data?.id ?? null;

  return {
    /** The signed-in account id, or `null`. */
    userId,
    /** Whether the viewer owns the work. Anonymous and signed-out viewers never do. */
    isOwner: Boolean(ownerId && userId && ownerId === userId),
  };
}
