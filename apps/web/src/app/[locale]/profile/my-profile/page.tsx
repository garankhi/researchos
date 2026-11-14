import { Suspense } from 'react';
import { Container } from '@chakra-ui/react';
import { LoadingSkeleton } from '@/components/ui/feedback';
import { RequireAuth } from '@/features/identity';
import { ProfileShell } from '@/features/profiles';

export default function MyProfilePage() {
  return (
    <RequireAuth>
      <Suspense
        fallback={
          <Container maxW="6xl" py="6">
            <LoadingSkeleton variant="rectangular" height={160} />
          </Container>
        }
      >
        <ProfileShell isOwner={true} />
      </Suspense>
    </RequireAuth>
  );
}
