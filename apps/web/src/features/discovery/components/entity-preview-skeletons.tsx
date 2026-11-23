'use client';

import { Box } from '@chakra-ui/react';
import type { SkeletonResult } from 'boneyard-js';
import { DelayedSkeleton } from '@/components/ui/delayed-skeleton';

/**
 * The group card while it loads.
 *
 * The bones mirror the real card — a heading, the direction count under
 * it, the description, and a first direction with its topic — so the
 * space is already reserved when the data lands.
 */
const groupCardLayout: SkeletonResult = {
  name: 'entity-preview-group',
  viewportWidth: 390,
  width: 288,
  height: 132,
  bones: [
    [0, 0, 58, 18, 0],
    [0, 24, 26, 12, 0],
    [0, 48, 96, 12, 0],
    [0, 66, 88, 12, 0],
    [0, 92, 64, 14, 0],
    [0, 112, 40, 12, 0],
  ],
};

/**
 * The researcher card while it loads.
 *
 * The bones mirror the real card — the avatar beside the name and the
 * unit under it, and the bio below.
 */
const researcherCardLayout: SkeletonResult = {
  name: 'entity-preview-researcher',
  viewportWidth: 390,
  width: 288,
  height: 108,
  bones: [
    [0, 2, 40, 40, '50%'],
    [48, 4, 52, 18, 0],
    [48, 28, 34, 12, 0],
    [0, 56, 92, 12, 0],
    [0, 74, 84, 12, 0],
  ],
};

/**
 * The skeleton shown while the preview of either kind of entity loads.
 */
export function EntityPreviewSkeleton({
  entityType,
}: {
  entityType: 'GROUP' | 'RESEARCHER';
}) {
  return (
    <Box minW="0" data-testid="loading-skeleton">
      {entityType === 'GROUP' ? (
        <DelayedSkeleton layout={groupCardLayout} announce={false} />
      ) : (
        <DelayedSkeleton layout={researcherCardLayout} announce={false} />
      )}
    </Box>
  );
}
