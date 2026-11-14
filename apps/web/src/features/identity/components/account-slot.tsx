'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@chakra-ui/react';
import { usePathname } from '@/i18n/navigation';
import NextLink from '@/components/ui/link';
import { AccountMenu } from './account-menu';
import { useSession } from '../hooks/use-session';
import { buildLoginHref } from '../utils/return-to';

/**
 * The account area of the header.
 *
 * It holds three mutually exclusive states:
 *
 * - **checking** — the session has not been answered yet, so nothing is
 *   shown. Showing "Sign in" here would be a lie for a signed-in user;
 * - **signed in** — the account menu, with the avatar, the name and the
 *   way out;
 * - **signed out** — a link to the login screen.
 *
 * ## Why the sign-in link carries the current page
 *
 * The link to the login screen carries the page the user is on as a
 * `returnTo` parameter, so signing in brings them back to where they
 * were instead of dumping them on the home page.
 *
 * The path comes from `usePathname()` of the locale-aware router, so it
 * is locale-free. The router adds the locale prefix when following the link.
 */
export function AccountSlot() {
  const t = useTranslations('identity');

  const { user, isChecking } = useSession();
  const pathname = usePathname();

  if (isChecking) {
    return null;
  }

  if (user) {
    return <AccountMenu />;
  }

  return (
    <Button asChild variant="outline" size="sm">
      <NextLink href={buildLoginHref(pathname)}>{t('signInAction')}</NextLink>
    </Button>
  );
}
