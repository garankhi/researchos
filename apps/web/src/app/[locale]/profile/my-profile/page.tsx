import { Suspense } from 'react';
import { RequireAuth } from '@/features/identity';
import { ProfilePageSkeleton, ProfileShell } from '@/features/profiles';

export default function MyProfilePage() {
  return (
    /*
     * The guard reads `usePathname()`, which Next.js requires to sit inside
     * a `<Suspense>` boundary — otherwise the static export of this route
     * fails with "URL data `usePathname()` in a Client Component outside
     * of `<Suspense>`".
     */
    <Suspense fallback={<ProfilePageSkeleton />}>
      <RequireAuth>
        <ProfileShell isOwner={true} />
      </RequireAuth>
    </Suspense>
  );
}
