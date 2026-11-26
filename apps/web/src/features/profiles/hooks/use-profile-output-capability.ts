'use client';

import { useAuthControllerMe } from '@/lib/api';
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
 * Whether the viewer may change the audience comes from the server. The
 * scope of the work decides it: the owner of a personal work, the leads
 * of the group of a group work, or the project lead and the parent group
 * leads of a project work. The poster of a container work may not,
 * because the container owns the post.
 */
export function useProfileOutputCapability({
  output,
}: {
  output: OutputResponseDto;
}): OutputCapability {
  const meQuery = useAuthControllerMe({
    query: { retry: false },
  });

  return resolveOutputCapability({
    userId: meQuery.data?.id ?? null,
    ownerId: typeof output.ownerId === 'string' ? output.ownerId : null,
    authorUserIds: (output.authors ?? [])
      .map((author) => author.userId)
      .filter((id) => typeof id === 'string') as string[],
    scopeType: output.scopeType,
    canChangeVisibility: output.canChangeVisibility,
  });
}
