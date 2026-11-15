'use client';

import { useAuthControllerMe, useGroupsControllerFindOne } from '@/lib/api';
import {
  resolveOutputCapability,
  type OutputCapability,
} from '@/utils/output-capability';
import type { OutputResponseDto } from '../types';

/**
 * What the signed-in viewer may do with a work listed on a profile card.
 *
 * The rule itself lives in `utils/output-capability.ts` — the output
 * detail page uses the same one, and a rule duplicated across two
 * features is a rule that will drift.
 *
 * The affiliated group's lead may also change the visibility of a work
 * carrying its banner, so the group is fetched to learn who that is. The
 * request is disabled for a work with no affiliation, which is the common
 * case.
 */
export function useProfileOutputCapability({
  output,
}: {
  output: OutputResponseDto;
}): OutputCapability {
  const meQuery = useAuthControllerMe({
    query: { retry: false },
  });

  const groupId =
    typeof output.accessGroupId === 'string' ? output.accessGroupId : null;

  const groupQuery = useGroupsControllerFindOne(groupId ?? '', {
    query: {
      enabled: Boolean(groupId),
      staleTime: 60 * 1000,
    },
  });

  return resolveOutputCapability({
    userId: meQuery.data?.id ?? null,
    ownerId: typeof output.ownerId === 'string' ? output.ownerId : null,
    authorUserIds: (output.authors ?? [])
      .map((author) => author.userId)
      .filter((id) => typeof id === 'string') as string[],
    groupLeadId: groupQuery.data?.leadId ?? null,
  });
}
