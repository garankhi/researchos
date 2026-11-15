import { Box, Container, Flex, SimpleGrid, Stack } from '@chakra-ui/react';
import type { SkeletonResult } from 'boneyard-js';
import { DelayedSkeleton } from '@/components/ui/delayed-skeleton';
import type { ProfileTab } from '../types';

const mobileAvatar: SkeletonResult = {
  name: 'profile-avatar-mobile',
  viewportWidth: 390,
  width: 80,
  height: 80,
  bones: [[0, 0, 100, 80, 0]],
};

const desktopAvatar: SkeletonResult = {
  name: 'profile-avatar-desktop',
  viewportWidth: 768,
  width: 100,
  height: 100,
  bones: [[0, 0, 100, 100, 0]],
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
  width: 960,
  height: 100,
  bones: [
    [0, 2, 38, 24, 0],
    [0, 40, 55, 16, 0],
    [0, 68, 23, 18, 0],
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
  height: 92,
  bones: [
    [0, 2, 52, 16, 0],
    [75, 0, 25, 20, 0],
    [0, 25, 24, 12, 0],
    [0, 52, 95, 14, 0],
    [0, 74, 65, 14, 0],
  ],
};

const applicationCard: SkeletonResult = {
  name: 'profile-application-card',
  viewportWidth: 768,
  width: 1152,
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
  width: 1152,
  height: 92,
  bones: [
    [0, 0, 65, 18, 0],
    [0, 25, 53, 14, 0],
    [0, 50, 38, 14, 0],
    [0, 74, 23, 16, 0],
    [26, 74, 16, 16, 0],
  ],
};

const outputVisibility: SkeletonResult = {
  name: 'profile-output-visibility',
  viewportWidth: 390,
  width: 108,
  height: 20,
  bones: [[0, 0, 100, 20, 0]],
};

const interestCard: SkeletonResult = {
  name: 'profile-interest-card',
  viewportWidth: 768,
  width: 1152,
  height: 65,
  bones: [
    [0, 0, 48, 16, 0],
    [0, 23, 76, 12, 0],
    [0, 45, 23, 18, 0],
    [27, 45, 26, 18, 0],
  ],
};

const openAlexCard: SkeletonResult = {
  name: 'profile-openalex-card',
  viewportWidth: 768,
  width: 1152,
  height: 126,
  bones: [
    [0, 0, 66, 18, 0],
    [0, 25, 49, 14, 0],
    [0, 50, 38, 14, 0],
    [43, 49, 29, 16, 0],
    [0, 81, 91, 14, 0],
    [0, 104, 70, 14, 0],
  ],
};

const applicationAction: SkeletonResult = {
  name: 'profile-application-action',
  viewportWidth: 390,
  width: 104,
  height: 32,
  bones: [[0, 0, 100, 32, 0]],
};

const interestActions: SkeletonResult = {
  name: 'profile-interest-actions',
  viewportWidth: 390,
  width: 68,
  height: 32,
  bones: [
    [0, 0, 47, 32, 0],
    [53, 0, 47, 32, 0],
  ],
};

const openAlexActions: SkeletonResult = {
  name: 'profile-openalex-actions',
  viewportWidth: 390,
  width: 168,
  height: 32,
  bones: [
    [0, 0, 46, 32, 0],
    [54, 0, 46, 32, 0],
  ],
};

const interestHeadingAction: SkeletonResult = {
  name: 'profile-interest-heading-action',
  viewportWidth: 390,
  width: 124,
  height: 32,
  bones: [[0, 0, 100, 32, 0]],
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
    <Box bg="bg.panel" borderWidth="1px" p={{ base: '4', md: '6' }}>
      <Flex
        direction={{ base: 'column', sm: 'row' }}
        gap="6"
        align={{ base: 'center', sm: 'flex-start' }}
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
            <DelayedSkeleton
              layout={desktopHeaderDetails}
              announce={announce}
            />
          </Box>
        </Box>
      </Flex>
    </Box>
  );
}

export function ProfilePageSkeleton() {
  return (
    <Container maxW="6xl" py={{ base: '4', md: '8' }}>
      <ProfileHeaderSkeleton />
    </Container>
  );
}

export function ProfileTabSkeleton({
  tab,
  isOwner = false,
}: {
  tab: ProfileTab;
  isOwner?: boolean;
}) {
  if (tab === 'groups') {
    return (
      <Stack gap="3" py="1">
        <DelayedSkeleton layout={groupHeading} />
        <SimpleGrid columns={{ base: 1, md: 2 }} gap="4">
          {[1, 2, 3, 4].map((card) => (
            <Box key={card} bg="bg.panel" borderWidth="1px" p="5">
              <DelayedSkeleton layout={groupCard} announce={false} />
            </Box>
          ))}
        </SimpleGrid>
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
    <Stack gap={tab === 'interests' ? '3' : '4'} py="1">
      {showHeading && (
        <Flex justify="space-between" align="center" gap="3" mb="1">
          <Box flex="1" minW="0">
            <DelayedSkeleton layout={sectionHeading} />
          </Box>
          {tab === 'interests' && (
            <Box w="124px" maxW="45%" flexShrink="0">
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
          bg="bg.panel"
          borderWidth="1px"
          p={tab === 'interests' ? '4' : '5'}
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
