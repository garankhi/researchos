import { Box, Container, Stack } from '@chakra-ui/react';
import type { SkeletonResult } from 'boneyard-js';
import { DelayedSkeleton } from '@/components/ui/delayed-skeleton';

/**
 * The heading block of the onboarding: a title, a line of copy and the
 * progress bar.
 */
const heading: SkeletonResult = {
  name: 'onboarding-heading',
  viewportWidth: 768,
  width: 640,
  height: 96,
  bones: [
    [0, 0, 46, 26, 0],
    [0, 38, 80, 16, 0],
    [0, 66, 100, 8, 0],
  ],
};

/**
 * The step strip under the heading.
 */
const stepStrip: SkeletonResult = {
  name: 'onboarding-step-strip',
  viewportWidth: 768,
  width: 640,
  height: 34,
  bones: [
    [0, 0, 18, 20, 0],
    [88, 0, 18, 20, 0],
    [176, 0, 18, 20, 0],
    [264, 0, 18, 20, 0],
  ],
};

/**
 * One panel of the current step.
 *
 * The panel is the shape every step shares: a heading line and a few
 * rows beneath it.
 */
const stepPanel: SkeletonResult = {
  name: 'onboarding-step-panel',
  viewportWidth: 768,
  width: 640,
  height: 220,
  bones: [
    [0, 0, 34, 18, 0],
    [0, 34, 90, 14, 0],
    [0, 62, 100, 12, 0],
    [0, 86, 82, 12, 0],
  ],
};

/**
 * The whole onboarding screen.
 *
 * It mirrors the flow: a heading with the progress bar, the step strip,
 * and the panel of the current step.
 */
export function OnboardingSkeleton() {
  return (
    <Container maxW="48rem" py={{ base: '6', md: '10' }}>
      <Stack gap="6">
        <DelayedSkeleton layout={heading} />
        <DelayedSkeleton layout={stepStrip} announce={false} />
        <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '5' }}>
          <DelayedSkeleton layout={stepPanel} announce={false} />
        </Box>
      </Stack>
    </Container>
  );
}
