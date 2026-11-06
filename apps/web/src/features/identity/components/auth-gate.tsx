'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useMe } from '../hooks/use-me';
import { buildLoginHref } from '../utils/return-to';
import {
  isPublicRoute,
  resolveGateDecision,
  type GateDecision,
} from '../utils/auth-gate';

/**
 * The gate in front of every route.
 *
 * The platform is for signed-in users only: an unauthenticated visitor must
 * not reach a screen the backend would refuse to answer. This component is
     * what enforces that on the frontend, and it enforces it in exactly one
 * place — the `[locale]` layout — so a new route is protected by default
 * rather than by remembering to protect it.
 *
 * ## What it does
 *
 * - **renders** the page;
 * - **redirects** a signed-out visitor to the login screen, carrying the
 *   page they wanted in `returnTo`.
 *
 * ## Why it does not hold the page back
 *
 * An earlier version replaced the page with a skeleton until the session
 * check came back. That cannot work here: the check is a browser request,
 * so the **server** never gets an answer and always rendered the skeleton.
 * The page therefore never reached the server's HTML — Next.js dropped the
 * segment (`This segment was dropped from rendering`) and every protected
 * page lost its server shell.
 *
 * So the gate renders the page and redirects the moment the answer says
 * "no session". The rule it enforces is unchanged: a signed-out visitor
 * never gets to *use* the platform, because every request it makes is
 * refused by the backend with `401`.
 *
 * ## Why it redirects instead of rendering `unauthorized.tsx`
 *
 * "Not signed in" is a state with a way forward, not an error. The visitor
 * has a credential and a form to fill in; showing them a 401 page with a
 * link to a login screen they then have to click is a worse version of the
 * same thing. The `unauthorized()` boundary still exists — it is the right
 * answer for a screen that needs a session it does not have and cannot
     * offer a sign-in for — but it is not the answer for the platform-wide
 * rule.
 *
 * ## Why it reads `useMe` and not `useSession`
 *
 * `useSession().isSignedOut` is **not** "the API answered 401". It is
 * "there is no account and the check has finished", which is also true when
 * the API is down — the session store is cleared on a failure it cannot
 * explain. A gate bound to that flag would redirect to the login screen
 * when the API is unreachable, and the login screen would fail the same
 * way: the visitor ends up in a loop with no way out.
 *
 * `useMe().isSignedOut` is the strict reading — the API answered `401` —
 * so the gate only redirects when the backend really said "not signed in".
 * A failed request renders the page, and the page's own error state
 * explains what happened.
 *
 * ## Why the decision lives in a separate module
 *
 * The rules are pure, so they are tested without a browser, a session or a
     * React tree. See `utils/auth-gate.ts`.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const { isSignedOut } = useMe();

  const decision: GateDecision = resolveGateDecision({
    isPublicRoute: isPublicRoute(pathname),
    isSignedOut,
  });

  useEffect(() => {
    if (decision !== 'redirect') {
      return;
    }

    // `replace` rather than `push`: the protected page is not somewhere the
    // visitor wants the back button to take them to, and pushing it would
    // put a dead entry in the history that would redirect again.
    router.replace(buildLoginHref(pathname));
  }, [decision, pathname, router]);

  // The children always render. The gate decides *after* the answer comes
  // back, and a page that never reaches the server shell is a page that
  // cannot be prerendered, prefetched or instantly navigated to.
  return <>{children}</>;
}
