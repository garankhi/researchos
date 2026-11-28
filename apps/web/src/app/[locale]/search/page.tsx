'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { SearchPage } from '@/features/discovery';
import {
  RequireAuth,
  RequireOnboarding,
  useCurrentUser,
} from '@/features/identity';
import Loading from '../loading';

function SearchScreen() {
  const params = useSearchParams().toString();
  const user = useCurrentUser();

  return (
    <RequireAuth returnTo={params ? `/search?${params}` : '/search'}>
      <RequireOnboarding>
        {user && (
          <SearchPage
            user={{ id: user.id, canFollow: user.roles.includes('RESEARCHER') }}
          />
        )}
      </RequireOnboarding>
    </RequireAuth>
  );
}

export default function SearchRoute() {
  return (
    <Suspense fallback={<Loading />}>
      <SearchScreen />
    </Suspense>
  );
}
