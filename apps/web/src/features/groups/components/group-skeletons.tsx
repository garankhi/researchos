import { Box, Stack } from '@chakra-ui/react';
import type { SkeletonResult } from 'boneyard-js';
import { DelayedSkeleton } from '@/components/ui/delayed-skeleton';

const header: SkeletonResult = {
  name: 'group-hub-header',
  viewportWidth: 768,
  width: 1152,
  height: 180,
  bones: [
    [0, 0, 30, 20, 0],
    [0, 38, 65, 30, 0],
    [0, 84, 18, 14, 0],
    [0, 114, 20, 20, 0],
    [0, 152, 85, 16, 0],
  ],
};
const mobileCard: SkeletonResult = {
  name: 'group-card-mobile',
  viewportWidth: 390,
  width: 576,
  height: 200,
  bones: [
    [0, 0, 12, 40, 0],
    [0, 56, 48, 18, 0],
    [0, 86, 70, 16, 0],
    [0, 116, 60, 16, 0],
    [0, 146, 85, 16, 0],
    [0, 178, 24, 18, 0],
  ],
};
const desktopCard: SkeletonResult = {
  name: 'group-card-desktop',
  viewportWidth: 768,
  width: 1152,
  height: 138,
  bones: [
    [0, 0, 4, 40, 0],
    [6, 0, 38, 18, 0],
    [6, 30, 58, 16, 0],
    [6, 60, 50, 16, 0],
    [6, 90, 80, 16, 0],
    [6, 120, 18, 18, 0],
  ],
};
const line: SkeletonResult = {
  name: 'group-inline-loading',
  viewportWidth: 390,
  width: 1152,
  height: 24,
  bones: [[0, 0, 55, 18, 0]],
};

export function GroupLineSkeleton() {
  return <DelayedSkeleton layout={line} />;
}

export function GroupListSkeleton({ announce = true }: { announce?: boolean }) {
  return (
    <Stack gap="4">
      {[0, 1].map((index) => (
        <Box key={index} data-testid="loading-skeleton" borderWidth="1px" p="4">
          <Box display={{ base: 'block', md: 'none' }}>
            <DelayedSkeleton
              layout={mobileCard}
              announce={announce && index === 0}
            />
          </Box>
          <Box display={{ base: 'none', md: 'block' }}>
            <DelayedSkeleton
              layout={desktopCard}
              announce={announce && index === 0}
            />
          </Box>
        </Box>
      ))}
    </Stack>
  );
}

export function GroupHubSkeleton() {
  return (
    <Stack gap="6">
      <Box borderWidth="1px" p={{ base: '4', md: '6' }}>
        <DelayedSkeleton layout={header} />
      </Box>
      <GroupListSkeleton announce={false} />
    </Stack>
  );
}
