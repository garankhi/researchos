import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { ApiStatus } from './_components/api-status';

export default async function Home() {
  const t = await getTranslations('home');

  return (
    <Suspense fallback={<p>{t('loadingStatus')}</p>}>
      <ApiStatus />
    </Suspense>
  );
}
