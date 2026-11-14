'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  Button,
  Container,
  Heading,
  Icon,
  Stack,
  Text,
} from '@chakra-ui/react';
import { LogIn } from 'lucide-react';
import NextLink from '@/components/ui/link';
import { LoadingSkeleton } from '@/components/ui/feedback';
import { usePathname } from '@/i18n/navigation';
import { useSession } from '../hooks/use-session';
import { buildLoginHref } from '../utils/return-to';

/**
 * The front-end guard for a page that only a signed-in user may see.
 *
 * ## Why the front end needs a guard at all
 *
 * The API already refuses the request: `GET /me` answers `401` when there
 * is no valid session behind it, and the backend `SessionGuard` turns
 * every protected route into an authenticated route. That refusal is the
 * real boundary — the guard here is about what the reader *sees*.
 *
 * Without it, an anonymous visitor lands on the page and gets either a
 * skeleton that never resolves into anything, or a generic "something
 * went wrong" error with a retry button that will fail again for exactly
 * the same reason. Neither says the one true thing: you are not signed
 * in, and here is the way to sign in.
 *
 * ## Why it waits instead of redirecting
 *
 * The guard does not bounce the visitor to the login screen on its own.
 * A redirect would throw away the page the visitor was trying to reach,
 * and the session check is asynchronous — the first render happens before
 * the answer arrives, so a redirect on "not signed in" would fire on
 * every protected page before the check had even run.
 *
 * Instead the guard waits for the answer and then renders the sign-in
 * prompt. The link carries the current page as `returnTo`, so signing in
 * brings the visitor back to where they were.
 *
 * ## Why a failed check is not a signed-out visitor
 *
 * When the check itself fails — the API is down, the network dropped —
 * the session is *unknown*, not absent. Signing the visitor out because
 * of a transient error would be wrong, and so would pretending they are
 * signed in. The guard shows the error and lets the reader retry.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const t = useTranslations('unauthorized');
  const tErrors = useTranslations('errors');
  const tCommon = useTranslations('common');
  const pathname = usePathname();

  const { user, isChecking, isFailed, refetch } = useSession();

  if (isChecking) {
    return (
      <Container as="main" maxW="lg" py="8">
        <Stack gap="4">
          <LoadingSkeleton variant="rectangular" height={120} />
          <LoadingSkeleton variant="text" count={3} />
        </Stack>
      </Container>
    );
  }

  /*
   * The check failed, so the session is unknown. This is not the same as
   * being signed out, and it is not the same as being signed in either.
   */
  if (isFailed) {
    return (
      <Container as="main" maxW="lg" py="8">
        <Stack gap="3" align="center" textAlign="center">
          <Icon size="2xl" color="fg.muted">
            <LogIn aria-hidden />
          </Icon>
          <Heading as="h1" size="xl">
            {tErrors('loadFailedTitle')}
          </Heading>
          <Text color="fg.muted">{tErrors('loadFailedDescription')}</Text>
          <Button variant="outline" onClick={() => void refetch()}>
            {tCommon('retry')}
          </Button>
        </Stack>
      </Container>
    );
  }

  if (!user) {
    return (
      <Container as="main" maxW="lg" py="8">
        <Stack gap="3" align="center" textAlign="center">
          <Icon size="2xl" color="fg.muted">
            <LogIn aria-hidden />
          </Icon>
          <Heading as="h1" size="xl">
            {t('title')}
          </Heading>
          <Text color="fg.muted">{t('description')}</Text>
          <Button asChild>
            <NextLink href={buildLoginHref(pathname)}>{t('action')}</NextLink>
          </Button>
        </Stack>
      </Container>
    );
  }

  return <>{children}</>;
}
