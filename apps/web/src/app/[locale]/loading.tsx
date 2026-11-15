import { Container } from '@chakra-ui/react';
import { DelayedSkeleton } from '@/components/ui/delayed-skeleton';

const routeLayout = {
  name: 'locale-route',
  viewportWidth: 768,
  width: 720,
  height: 136,
  bones: [
    [0, 4, 30, 26, 0],
    [0, 49, 63, 15, 0],
    [0, 77, 80, 15, 0],
    [0, 105, 51, 15, 0],
  ],
};

export default function Loading() {
  return (
    <Container as="main" maxW="3xl" py="4">
      <DelayedSkeleton layout={routeLayout} />
    </Container>
  );
}
