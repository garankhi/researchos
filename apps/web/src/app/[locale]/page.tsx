import { Suspense } from 'react';
import { ApiStatus } from './_components/api-status';

export default function Home() {
  return (
    <Suspense fallback={<p>Loading API status…</p>}>
      <ApiStatus />
    </Suspense>
  );
}
