import { Box, Container, Grid, Stack } from '@chakra-ui/react';
import type { SkeletonResult } from 'boneyard-js';
import { DelayedSkeleton } from '@/components/ui/delayed-skeleton';

const headerLayout: SkeletonResult = {
  name: 'opportunity-detail',
  viewportWidth: 768,
  width: 780,
  height: 148,
  bones: [
    [0, 0, 14, 18, 0],
    [16, 2, 22, 14, 0],
    [0, 26, 86, 28, 0],
    [0, 62, 54, 16, 0],
    [0, 88, 18, 20, 0],
    [20, 88, 18, 20, 0],
  ],
};

const bodyLayout: SkeletonResult = {
  name: 'opportunity-detail-body',
  viewportWidth: 768,
  width: 640,
  height: 156,
  bones: [
    [0, 0, 24, 18, 0],
    [0, 28, 98, 14, 0],
    [0, 48, 94, 14, 0],
    [0, 68, 90, 14, 0],
    [0, 88, 66, 14, 0],
  ],
};

const sidebarLayout: SkeletonResult = {
  name: 'opportunity-detail-sidebar',
  viewportWidth: 768,
  width: 300,
  height: 168,
  bones: [
    [0, 0, 52, 16, 0],
    [0, 26, 36, 12, 0],
    [0, 42, 74, 14, 0],
    [0, 66, 32, 12, 0],
    [0, 82, 84, 14, 0],
  ],
};

/**
 * The heading of the applications panel: its title and the count beside
 * it.
 */
const applicationsHeadingLayout: SkeletonResult = {
  name: 'opportunity-applications-heading',
  viewportWidth: 768,
  width: 640,
  height: 20,
  bones: [
    [0, 2, 46, 16, 0],
    [48, 2, 8, 16, 0],
  ],
};

/**
 * One application row: the avatar beside the applicant's details.
 *
 * The bones mirror the real row — a round avatar on the left, the name
 * and the department beside it, the email under them.
 */
const applicationRowLayout: SkeletonResult = {
  name: 'opportunity-application-row',
  viewportWidth: 768,
  width: 640,
  height: 72,
  bones: [
    [0, 0, 12, 30, '50%'],
    [16, 2, 38, 16, 0],
    [16, 24, 26, 12, 0],
    [16, 42, 44, 12, 0],
  ],
};

/**
 * The applications list while it loads.
 *
 * Three rows are drawn, so the panel reserves roughly the space the list
 * will occupy and the page does not jump when the data lands.
 */
export function OpportunityApplicationsSkeleton() {
  return (
    <Box bg="bg.panel" boxShadow="xs">
      <Box
        px={{ base: '4', md: '6' }}
        py="4"
        borderBottomWidth="1px"
        borderColor="border"
      >
        <DelayedSkeleton layout={applicationsHeadingLayout} announce />
      </Box>
      <Box px={{ base: '4', md: '6' }}>
        {[1, 2, 3].map((row) => (
          <Box
            key={row}
            py="4"
            borderBottomWidth={row < 3 ? '1px' : '0'}
            borderColor="border"
          >
            <DelayedSkeleton layout={applicationRowLayout} announce={false} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/** The skeleton shown while the opportunity detail page is loading. */
export function OpportunityDetailSkeleton() {
  return (
    <Box flex="1" bg="home.background">
      <Box bg="bg.panel" borderBottomWidth="1px" borderColor="border">
        <Container
          maxW="64rem"
          px={{ base: '4', md: '6' }}
          pt={{ base: '5', md: '8' }}
          pb={{ base: '5', md: '7' }}
        >
          <DelayedSkeleton layout={headerLayout} />
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
              <DelayedSkeleton layout={bodyLayout} announce={false} />
            </Box>
          </Stack>

          <Box hideBelow="lg" bg="bg.panel" boxShadow="xs" p="5">
            <DelayedSkeleton layout={sidebarLayout} announce={false} />
          </Box>
        </Grid>
      </Container>
    </Box>
  );
}
