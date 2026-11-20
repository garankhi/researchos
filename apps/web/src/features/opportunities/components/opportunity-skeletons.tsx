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
