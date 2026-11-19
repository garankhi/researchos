import { Box, Container, Grid, Stack } from '@chakra-ui/react';
import type { SkeletonResult } from 'boneyard-js';
import { DelayedSkeleton } from '@/components/ui/delayed-skeleton';

/**
 * The group hero banner.
 *
 * Mirrors `GroupHeader`: badges, a large title, an eyebrow line and a
 * description paragraph.
 */
const header: SkeletonResult = {
  name: 'group-hero',
  viewportWidth: 1024,
  width: 1024,
  height: 210,
  bones: [
    [0, 0, 14, 20, 0],
    [0, 32, 62, 34, 0],
    [0, 80, 34, 18, 0],
    [0, 112, 84, 16, 0],
    [0, 138, 70, 16, 0],
    [0, 176, 30, 20, 0],
  ],
};

/**
 * The tab strip under the hero banner.
 */
const tabs: SkeletonResult = {
  name: 'group-tabs',
  viewportWidth: 1024,
  width: 1024,
  height: 48,
  bones: [
    [0, 0, 18, 20, 0],
    [70, 0, 20, 20, 0],
    [142, 0, 24, 20, 0],
    [218, 0, 20, 20, 0],
  ],
};

/**
 * One row of the output list inside the main column panel.
 */
const outputRow: SkeletonResult = {
  name: 'group-output-row',
  viewportWidth: 1024,
  width: 700,
  height: 150,
  bones: [
    [0, 0, 16, 18, 0],
    [52, 0, 14, 18, 0],
    [0, 30, 72, 22, 0],
    [0, 64, 40, 16, 0],
    [0, 90, 88, 16, 0],
    [0, 116, 22, 18, 0],
  ],
};

/**
 * One card of the right-hand sidebar column.
 */
const sidebarCard: SkeletonResult = {
  name: 'group-sidebar-card',
  viewportWidth: 1024,
  width: 320,
  height: 150,
  bones: [
    [0, 0, 30, 18, 0],
    [0, 34, 90, 22, 0],
    [0, 68, 60, 16, 0],
    [0, 94, 76, 16, 0],
    [0, 120, 40, 16, 0],
  ],
};

export function GroupLineSkeleton() {
  return <DelayedSkeleton layout={outputRow} />;
}

export function GroupListSkeleton({ announce = true }: { announce?: boolean }) {
  return (
    <Stack gap="4">
      {[0, 1].map((index) => (
        <Box key={index} data-testid="loading-skeleton">
          <DelayedSkeleton
            layout={outputRow}
            announce={announce && index === 0}
          />
        </Box>
      ))}
    </Stack>
  );
}

/**
 * The whole group screen.
 *
 * Matches the layout the shell renders: a white hero banner with the tab
 * strip, then the two-column grid on the canvas below.
 */
export function GroupHubSkeleton() {
  return (
    <Stack gap="0">
      <Box bg="bg.panel" borderBottomWidth="1px" borderColor="border">
        <Container
          maxW="64rem"
          px={{ base: '4', md: '6' }}
          pt={{ base: '5', md: '8' }}
        >
          <Stack gap="5">
            <Box>
              <DelayedSkeleton layout={header} announce={false} />
            </Box>
            <Box>
              <DelayedSkeleton layout={tabs} announce={false} />
            </Box>
          </Stack>
        </Container>
      </Box>

      <Container
        maxW="64rem"
        px={{ base: '4', md: '6' }}
        py={{ base: '4', lg: '6' }}
      >
        <Grid
          templateColumns={{
            base: 'minmax(0, 1fr)',
            lg: 'minmax(0, 1.95fr) minmax(0, 1fr)',
          }}
          alignItems="start"
          gap="4"
        >
          <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '6' }}>
            <GroupListSkeleton announce={false} />
          </Box>

          <Stack gap="4">
            <Box bg="bg.panel" boxShadow="xs" p="5">
              <DelayedSkeleton layout={sidebarCard} announce={false} />
            </Box>
            <Box bg="bg.panel" boxShadow="xs" p="5">
              <DelayedSkeleton layout={sidebarCard} announce={false} />
            </Box>
          </Stack>
        </Grid>
      </Container>
    </Stack>
  );
}
