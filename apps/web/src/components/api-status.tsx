'use client';

import { useAppControllerGetHello } from '@/lib/api/app/app';

export function ApiStatus() {
  const { data, isPending, isError } = useAppControllerGetHello();

  if (isPending) return <p>Contacting API…</p>;
  if (isError) return <p>API is unreachable (is it running on :4000?).</p>;
  return <p>API says: {data}</p>;
}
