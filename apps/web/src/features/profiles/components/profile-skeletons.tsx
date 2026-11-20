import { Box, Container, Flex, Grid, Stack } from '@chakra-ui/react';
import type { SkeletonResult } from 'boneyard-js';
import { DelayedSkeleton } from '@/components/ui/delayed-skeleton';
import type { ProfileTab } from '../types';

const mobileAvatar: SkeletonResult = {
  name: 'profile-avatar-mobile',
  viewportWidth: 390,
  width: 80,
  height: 80,
  bones: [[0, 0, 100, 80, '50%']],
};

const desktopAvatar: SkeletonResult = {
  name: 'profile-avatar-desktop',
  viewportWidth: 768,
  width: 100,
  height: 100,
  bones: [[0, 0, 100, 100, '50%']],
};

const mobileHeaderDetails: SkeletonResult = {
  name: 'profile-header-details-mobile',
  viewportWidth: 390,
  width: 280,
  height: 88,
  bones: [
    [20, 2, 60, 24, 0],
    [9, 40, 82, 16, 0],
    [33, 68, 34, 18, 0],
  ],
};

const desktopHeaderDetails: SkeletonResult = {
  name: 'profile-header-details-desktop',
  viewportWidth: 768,
  width: 720,
  height: 92,
  bones: [
    [0, 4, 42, 26, 0],
    [0, 42, 64, 16, 0],
    [0, 70, 28, 18, 0],
  ],
};

const overviewAboutLayout: SkeletonResult = {
  name: 'profile-overview-about',
  viewportWidth: 768,
  width: 640,
  height: 148,
  bones: [
    [0, 0, 24, 18, 0],
    [0, 24, 96, 14, 0],
    [0, 44, 90, 14, 0],
    [0, 64, 62, 14, 0],
    [0, 96, 20, 22, 0],
    [22, 96, 24, 22, 0],
    [48, 96, 18, 22, 0],
  ],
};

const sidebarSummaryLayout: SkeletonResult = {
  name: 'profile-sidebar-summary',
  viewportWidth: 768,
  width: 300,
  height: 164,
  bones: [
    [0, 0, 56, 16, 0],
    [0, 28, 28, 32, 0],
    [36, 28, 28, 32, 0],
    [72, 28, 28, 32, 0],
    [0, 74, 88, 14, 0],
    [0, 94, 72, 14, 0],
  ],
};

const groupHeading: SkeletonResult = {
  name: 'profile-groups-heading',
  viewportWidth: 390,
  width: 280,
  height: 20,
  bones: [[0, 2, 65, 16, 0]],
};

const groupCard: SkeletonResult = {
  name: 'profile-group-card',
  viewportWidth: 390,
  width: 576,
  height: 76,
  bones: [
    [0, 2, 52, 16, 0],
    [78, 0, 22, 18, 0],
    [0, 32, 24, 12, 0],
    [0, 60, 88, 14, 0],
  ],
};

const applicationCard: SkeletonResult = {
  name: 'profile-application-card',
  viewportWidth: 768,
  width: 640,
  height: 54,
  bones: [
    [0, 0, 62, 18, 0],
    [0, 28, 21, 20, 0],
    [24, 30, 39, 14, 0],
  ],
};

const outputCard: SkeletonResult = {
  name: 'profile-output-card',
  viewportWidth: 768,
  width: 640,
  height: 96,
  bones: [
    [0, 0, 18, 16, 0],
    [20, 2, 22, 14, 0],
    [0, 26, 78, 18, 0],
    [0, 54, 52, 14, 0],
    [0, 78, 24, 16, 0],
  ],
};

const outputVisibility: SkeletonResult = {
  name: 'profile-output-visibility',
  viewportWidth: 390,
  width: 96,
  height: 20,
  bones: [[0, 0, 100, 20, 0]],
};

/**
 * The layout of the outputs list while it loads.
 */
const outputsList: SkeletonResult = {
  name: 'profile-outputs-list',
  viewportWidth: 768,
  width: 640,
  height: 292,
  bones: [
    [0, 0, 100, 88, 0],
    [0, 102, 100, 88, 0],
    [0, 204, 100, 88, 0],
  ],
};

const interestCard: SkeletonResult = {
  name: 'profile-interest-card',
  viewportWidth: 768,
  width: 640,
  height: 48,
  bones: [
    [0, 0, 48, 16, 0],
    [0, 54, 72, 12, 0],
  ],
};

const openAlexCard: SkeletonResult = {
  name: 'profile-openalex-card',
  viewportWidth: 768,
  width: 640,
  height: 118,
  bones: [
    [0, 0, 20, 16, 0],
    [0, 24, 76, 18, 0],
    [0, 52, 49, 14, 0],
    [0, 78, 91, 14, 0],
  ],
};

const followingRow: SkeletonResult = {
  name: 'profile-following-row',
  viewportWidth: 768,
  width: 640,
  height: 56,
  bones: [
    [0, 0, 40, 40, 0],
    [48, 4, 44, 16, 0],
    [48, 28, 24, 12, 0],
  ],
};

const applicationAction: SkeletonResult = {
  name: 'profile-application-action',
  viewportWidth: 390,
  width: 96,
  height: 28,
  bones: [[0, 0, 100, 28, 0]],
};

const interestActions: SkeletonResult = {
  name: 'profile-interest-actions',
  viewportWidth: 390,
  width: 64,
  height: 28,
  bones: [
    [0, 0, 46, 28, 0],
    [54, 0, 46, 28, 0],
  ],
};

const openAlexActions: SkeletonResult = {
  name: 'profile-openalex-actions',
  viewportWidth: 390,
  width: 156,
  height: 28,
  bones: [
    [0, 0, 46, 28, 0],
    [54, 0, 46, 28, 0],
  ],
};

const interestHeadingAction: SkeletonResult = {
  name: 'profile-interest-heading-action',
  viewportWidth: 390,
  width: 116,
  height: 28,
  bones: [[0, 0, 100, 28, 0]],
};

const sectionHeading: SkeletonResult = {
  name: 'profile-tab-heading',
  viewportWidth: 390,
  width: 200,
  height: 20,
  bones: [[0, 2, 84, 16, 0]],
};

/** The rows of the topic picker in the interest dialog. */
export const topicOptions: SkeletonResult = {
  name: 'profile-topic-options',
  viewportWidth: 390,
  width: 448,
  height: 136,
  bones: [
    [0, 0, 100, 40, 0],
    [0, 48, 100, 40, 0],
    [0, 96, 100, 40, 0],
  ],
};

export function ProfileHeaderSkeleton({
  announce = true,
}: {
  announce?: boolean;
}) {
  return (
    <Flex
      direction={{ base: 'column', sm: 'row' }}
      gap="6"
      align={{ base: 'center', sm: 'center' }}
    >
      <Box hideFrom="sm" w="20" flexShrink="0">
        <DelayedSkeleton layout={mobileAvatar} announce={false} />
      </Box>
      <Box hideBelow="sm" w="25" flexShrink="0">
        <DelayedSkeleton layout={desktopAvatar} announce={false} />
      </Box>
      <Box w="full" minW="0" flex="1">
        <Box hideFrom="sm" maxW="280px" mx="auto">
          <DelayedSkeleton layout={mobileHeaderDetails} announce={announce} />
        </Box>
        <Box hideBelow="sm">
          <DelayedSkeleton layout={desktopHeaderDetails} announce={announce} />
        </Box>
      </Box>
    </Flex>
  );
}

export function ProfilePageSkeleton() {
  return (
    <Box flex="1" bg="home.background">
      <Box bg="bg.panel" borderBottomWidth="1px" borderColor="border">
        <Container
          maxW="64rem"
          px={{ base: '4', md: '6' }}
          pt={{ base: '5', md: '8' }}
          pb={{ base: '5', md: '7' }}
        >
          <ProfileHeaderSkeleton />
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
          <Stack gap="4" minW="0">
            <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '6' }}>
              <DelayedSkeleton layout={overviewAboutLayout} announce={false} />
            </Box>
            <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '6' }}>
              <DelayedSkeleton layout={outputsList} announce={false} />
            </Box>
          </Stack>

          <Box hideBelow="lg" bg="bg.panel" boxShadow="xs" p="5">
            <DelayedSkeleton layout={sidebarSummaryLayout} announce={false} />
          </Box>
        </Grid>
      </Container>
    </Box>
  );
}

export function ProfileTabSkeleton({
  tab,
  isOwner = false,
}: {
  tab: ProfileTab;
  isOwner?: boolean;
}) {
  if (tab === 'overview') {
    return (
      <Stack gap="5" py="1">
        <DelayedSkeleton layout={overviewAboutLayout} />
        <DelayedSkeleton layout={outputsList} announce={false} />
      </Stack>
    );
  }

  if (tab === 'groups') {
    return (
      <Stack gap="4" py="1">
        <DelayedSkeleton layout={groupHeading} />
        {[1, 2, 3].map((card) => (
          <Box
            key={card}
            py="3"
            borderBottomWidth={card < 3 ? '1px' : '0'}
            borderColor="border"
          >
            <DelayedSkeleton layout={groupCard} announce={false} />
          </Box>
        ))}
      </Stack>
    );
  }

  if (tab === 'following') {
    return (
      <Stack gap="4" py="1">
        <DelayedSkeleton layout={groupHeading} />
        {[1, 2, 3].map((row) => (
          <Box
            key={row}
            py="3"
            borderBottomWidth={row < 3 ? '1px' : '0'}
            borderColor="border"
          >
            <DelayedSkeleton layout={followingRow} announce={false} />
          </Box>
        ))}
      </Stack>
    );
  }

  const cardLayout = {
    applications: applicationCard,
    outputs: outputCard,
    interests: interestCard,
    openalex: openAlexCard,
  }[tab];
  const sideLayout = {
    applications: applicationAction,
    outputs: outputVisibility,
    interests: isOwner ? interestActions : undefined,
    openalex: openAlexActions,
  }[tab];
  const rowBreakpoint = tab === 'openalex' ? 'md' : 'sm';
  const showHeading = tab === 'openalex' || (tab === 'interests' && isOwner);

  return (
    <Stack gap="3" py="1">
      {showHeading && (
        <Flex justify="space-between" align="center" gap="3" mb="1">
          <Box flex="1" minW="0">
            <DelayedSkeleton layout={sectionHeading} />
          </Box>
          {tab === 'interests' && (
            <Box w="116px" maxW="45%" flexShrink="0">
              <DelayedSkeleton
                layout={interestHeadingAction}
                announce={false}
              />
            </Box>
          )}
        </Flex>
      )}
      {[1, 2, 3].map((card) => (
        <Box
          key={card}
          py="3.5"
          borderBottomWidth={card < 3 ? '1px' : '0'}
          borderColor="border"
        >
          <Flex
            direction={{ base: 'column', [rowBreakpoint]: 'row' }}
            align={{ base: 'stretch', [rowBreakpoint]: 'center' }}
            gap="4"
          >
            <Box flex="1" minW="0">
              <DelayedSkeleton
                layout={cardLayout}
                announce={!showHeading && card === 1}
              />
            </Box>
            {sideLayout && (
              <Box
                flexShrink="0"
                w={`${sideLayout.width}px`}
                alignSelf={tab === 'openalex' ? 'end' : 'start'}
                my={tab === 'outputs' ? undefined : { [rowBreakpoint]: 'auto' }}
              >
                <DelayedSkeleton layout={sideLayout} announce={false} />
              </Box>
            )}
          </Flex>
        </Box>
      ))}
    </Stack>
  );
}

/** The skeleton shown while the profile's outputs list is loading. */
export function ProfileOutputsSkeleton() {
  return (
    <Stack gap="4" py="1">
      <DelayedSkeleton layout={outputsList} />
    </Stack>
  );
}
