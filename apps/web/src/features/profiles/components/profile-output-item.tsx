'use client';

import { OutputCard, toOutputCardData } from '@/features/outputs';
import { useProfileOutputCapability } from '../hooks/use-profile-output-capability';
import type { OutputResponseDto } from '../types';
import { ProfileOutputActionsMenu } from './profile-output-actions-menu';

/**
 * A work listed on the profile page.
 *
 * The card itself is shared with the group page — see
 * `features/outputs/components/output-card.tsx`. This component adds the
 * one thing the profile owns: the per-work action menu.
 */
export function ProfileOutputItem({
  output,
  showBottomBorder = true,
}: {
  output: OutputResponseDto;
  showBottomBorder?: boolean;
}) {
  const capability = useProfileOutputCapability({ output });
  const showMenu = capability.role !== 'reader';

  const rev = output.currentRevision;
  const data = toOutputCardData({
    id: output.id,
    title: rev?.title || `Output #${output.id.slice(0, 8)}`,
    outputType: rev?.outputType ?? 'PAPER',
    abstract: rev?.abstract,
    venue: rev?.venue,
    publisher: rev?.publisher,
    releasedAt: rev?.releasedAt,
    firstSharedAt: output.firstSharedAt,
    publicationYear: rev?.publicationYear,
    doi: output.doi,
    externalUrl: rev?.externalUrl,
    sharingStatus: output.sharingStatus,
    audience: output.audience,
    authors: output.authors,
    topics: output.topics,
  });

  return (
    <OutputCard
      data={data}
      showBottomBorder={showBottomBorder}
      headerSlot={
        showMenu ? (
          <ProfileOutputActionsMenu output={output} capability={capability} />
        ) : null
      }
    />
  );
}
