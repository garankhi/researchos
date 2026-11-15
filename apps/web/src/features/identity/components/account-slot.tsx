'use client';

import { Button } from '@chakra-ui/react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import NextLink from '@/components/ui/link';
import { usePathname } from '@/i18n/navigation';
import { AccountMenu } from './account-menu';
import { AccountAvatar } from './account-menu-view';
import { useSession } from '../hooks/use-session';
import { buildLoginHref } from '../utils/return-to';

/** Reveal the account action after the session check. */
export function AccountSlot() {
  const t = useTranslations('identity');
  const { user, isChecking } = useSession();
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const returnTo = query ? `${pathname}?${query}` : pathname;

  if (user) return <AccountMenu />;
  if (isChecking) return null;

  return (
    <Button asChild variant="ghost" boxSize="11" minW="11" p="0">
      <NextLink
        href={buildLoginHref(returnTo)}
        aria-label={t('signInAction')}
        title={t('signInAction')}
      >
        <AccountAvatar />
      </NextLink>
    </Button>
  );
}
