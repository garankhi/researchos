'use client';

import { Button } from '@chakra-ui/react';
import { LockKeyhole, LogIn, SearchX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import NextLink from './link';
import { RouteFeedback } from './feedback';

const views = {
  401: { namespace: 'unauthorized', icon: LogIn },
  403: { namespace: 'forbidden', icon: LockKeyhole },
  404: { namespace: 'notFound', icon: SearchX },
} as const;

export function AccessFeedback({ status }: { status: keyof typeof views }) {
  const { namespace, icon: Icon } = views[status];
  const t = useTranslations(namespace);
  const common = useTranslations('common');
  const needsSignIn = status === 401;

  return (
    <RouteFeedback
      icon={<Icon aria-hidden />}
      title={t('title')}
      description={t('description')}
      action={
        <Button asChild>
          <NextLink href={needsSignIn ? '/login' : '/'}>
            {needsSignIn ? t('action') : common('backToHome')}
          </NextLink>
        </Button>
      }
    />
  );
}
