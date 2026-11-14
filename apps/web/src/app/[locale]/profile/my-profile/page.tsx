import { Suspense } from 'react';
import { Container } from '@chakra-ui/react';
import { LoadingSkeleton } from '@/components/ui/feedback';
import { RequireAuth } from '@/features/identity';
import { ProfileShell } from '@/features/profiles';

export default function MyProfilePage() {
  return (
    /*
     * The guard reads `usePathname()`, which Next.js requires to sit inside
     * a `<Suspense>` boundary — otherwise the static export of this route
     * fails with "URL data `usePathname()` in a Client Component outside
     * of `<Suspense>`".
     */
    <Suspense
      fallback={
        <Container maxW="6xl" py="6">
          <LoadingSkeleton variant="rectangular" height={160} />
        </Container>
      }
    >
      <RequireAuth>
        <ProfileShell isOwner={true} />
      </RequireAuth>
    </Suspense>
  );
}
