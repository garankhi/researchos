import { Box, Container, Skeleton, Stack } from '@chakra-ui/react';

/**
 * The skeleton of the onboarding screen.
 *
 * It mirrors the shape of the first step: a heading, a line of copy and
 * a panel of candidate rows. The step that follows it — the works — has
 * a different shape, so a skeleton that guessed wrong would jump.
 */
export function OpenAlexOnboardingSkeleton() {
  return (
    <Container maxW="48rem" py={{ base: '6', md: '10' }}>
      <Stack gap="6">
        <Box>
          <Skeleton height="8" width="60%" />
          <Skeleton height="4" width="85%" mt="3" />
        </Box>

        <Box bg="bg.panel" boxShadow="xs" p={{ base: '4', md: '6' }}>
          <Stack gap="4">
            {[0, 1, 2].map((row) => (
              <Stack key={row} gap="2">
                <Skeleton height="4" width="40%" />
                <Skeleton height="3" width="25%" />
              </Stack>
            ))}
          </Stack>
        </Box>
      </Stack>
    </Container>
  );
}
