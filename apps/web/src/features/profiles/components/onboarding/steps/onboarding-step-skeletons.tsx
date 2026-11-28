import { Box, Grid, Stack } from '@chakra-ui/react';
import type { SkeletonResult } from 'boneyard-js';
import { DelayedSkeleton } from '@/components/ui/delayed-skeleton';

/**
 * The skeleton layouts of the onboarding steps.
 *
 * Each layout mirrors the shape of the step it stands in for, so the
 * space is already reserved when the data arrives and the step does
 * not jump under the researcher's cursor.
 */

/**
 * The author list on the left: a few candidate rows.
 */
const authorList: SkeletonResult = {
  name: 'onboarding-author-list',
  viewportWidth: 768,
  width: 320,
  height: 188,
  bones: [
    [0, 0, 100, 44, 0],
    [0, 58, 100, 44, 0],
    [0, 116, 100, 44, 0],
  ],
};

/**
 * The detail panel on the right: a name, a row of links, the metrics
 * and a list of recent works.
 */
const authorDetail: SkeletonResult = {
  name: 'onboarding-author-detail',
  viewportWidth: 768,
  width: 420,
  height: 300,
  bones: [
    [0, 0, 46, 18, 0],
    [0, 26, 30, 12, 0],
    [0, 56, 100, 14, 0],
    [0, 92, 100, 12, 0],
    [0, 112, 100, 12, 0],
    [0, 140, 78, 14, 0],
    [0, 168, 100, 12, 0],
    [0, 186, 88, 12, 0],
    [0, 212, 72, 12, 0],
  ],
};

/**
 * One work card: the type badge, the title, the venue, the byline, a
 * few lines of abstract and the row of links.
 */
const workCard: SkeletonResult = {
  name: 'onboarding-work-card',
  viewportWidth: 768,
  width: 640,
  height: 176,
  bones: [
    [0, 0, 16, 16, 0],
    [22, 2, 10, 12, 0],
    [0, 26, 82, 18, 0],
    [0, 54, 44, 12, 0],
    [0, 74, 62, 12, 0],
    [0, 98, 100, 12, 0],
    [0, 116, 94, 12, 0],
    [0, 146, 26, 12, 0],
  ],
};

/**
 * One card of the profile form: a heading and a few field rows.
 */
const profileCard: SkeletonResult = {
  name: 'onboarding-profile-card',
  viewportWidth: 768,
  width: 640,
  height: 168,
  bones: [
    [0, 0, 30, 14, 0],
    [0, 30, 100, 36, 0],
    [0, 78, 100, 36, 0],
    [0, 126, 62, 36, 0],
  ],
};

/**
 * The skeleton of the author step.
 *
 * It keeps the two-column shape of the step: the candidate list on the
 * left and the evidence panel on the right.
 */
export function OnboardingAuthorStepSkeleton() {
  return (
    <Grid
      templateColumns={{
        base: '1fr',
        lg: 'minmax(0, 4.75fr) minmax(0, 6.25fr)',
      }}
      gap="4"
      alignItems="start"
    >
      <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '5' }}>
        <DelayedSkeleton layout={authorList} />
      </Box>

      <Box
        bg="bg.panel"
        boxShadow="xs"
        p={{ base: '4', md: '5' }}
        borderLeftWidth="3px"
        borderLeftColor="border.emphasized"
      >
        <DelayedSkeleton layout={authorDetail} announce={false} />
      </Box>
    </Grid>
  );
}

/**
 * The skeleton of the works step.
 *
 * It shows a few work cards, because those are what the step is made
 * of.
 */
export function OnboardingWorksStepSkeleton() {
  return (
    <Stack gap="3">
      {[1, 2, 3].map((card) => (
        <Box key={card} bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '5' }}>
          <DelayedSkeleton layout={workCard} announce={card === 1} />
        </Box>
      ))}
    </Stack>
  );
}

/**
 * The skeleton of the profile step.
 *
 * It shows the cards of the form, because the form is what the step
 * is made of — the researcher should see the fields arriving rather
 * than an empty page that fills in later.
 */
export function OnboardingProfileStepSkeleton() {
  return (
    <Stack gap="4">
      {[1, 2, 3].map((card) => (
        <Box key={card} bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '5' }}>
          <DelayedSkeleton layout={profileCard} announce={card === 1} />
        </Box>
      ))}
    </Stack>
  );
}
