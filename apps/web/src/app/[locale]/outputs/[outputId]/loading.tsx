import { Container } from '@chakra-ui/react';
import { OutputDetailSkeleton } from '@/features/outputs';

/**
 * Route-level loading UI for the publication detail segment.
 */
export default function Loading() {
  return (
    <Container maxW="6xl" py={{ base: '4', md: '8' }}>
      <OutputDetailSkeleton />
    </Container>
  );
}
