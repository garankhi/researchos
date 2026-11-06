/**
 * The rules of the auth gate — the rule that decides what a visitor who is
 * not signed in is allowed to reach.
 *
 * The gate itself lives in `components/auth-gate.tsx`. This module holds the
 * **pure** part of the decision, so the rules can be tested without a
 * browser and without a session.
 *
 * ## Why the decision is client-side
     *
 * The session rides an opaque, `httpOnly` cookie that the API issues. The
 * browser holds it and JavaScript cannot read it, so a server-side check is
 * only possible when the web app and the API share one origin. The two are
 * separate origins in development (`localhost:3000` and `localhost:4000`)
 * and sit behind a reverse proxy in production, and the deployment does not
 * pin the cookie's `Domain` attribute down.
 *
 * A proxy-level gate that reads the cookie would therefore be a **redirect
 * loop** in every topology where the cookie is scoped to the API host: the
     * proxy would never see it, send the visitor to `/login`, and send them
 * straight back after they signed in. The gate therefore asks the API —
 * `GET /me` — through the existing session hook, which is the same request
 * the header already makes and the same request the backend already
 * answers with `401`.
 *
 * The backend remains the authority. The gate does not decide who may
 * read what; it only decides whether to show a screen to someone the
 * backend would refuse to answer anyway.
 */
/**
 * The routes that stay reachable without a session.
 *
 * - `/login` — the sign-in screen. Gating it would loop: the gate would
 *   send the visitor to the login screen, which is where they already are.
 * - `/` — the home screen. It is the landing page, and it answers the
 *   "who am I?" question itself: a signed-out visitor sees a sign-in
 *   button instead of being thrown away. Gating it would leave a visitor
 *   who followed a shared link with nothing but a login form and no
 *   explanation of what they were trying to reach.
 *
 * A prefix matches itself and everything below it. The match is on a path
 * segment boundary, so a prefix never matches a longer word that happens
 * to start with the same letters.
 */
export const PUBLIC_ROUTE_PREFIXES = ['/login', '/'] as const;

/**
 * What the gate does with a request.
 *
 * - `render` — show the page.
 * - `redirect` — there is no session; send the visitor to the login screen.
 *
 * There is deliberately **no** "wait" decision. See
 * `resolveGateDecision` for why the gate cannot hold the page back while
 * the answer is unknown.
 */
export type GateDecision = 'render' | 'redirect';

/**
 * Whether a pathname stays reachable without a session.
     *
 * The pathname is the **locale-free** one the router reports — `/login`,
 * not `/vi/login` — because the locale is a routing concern and the gate
 * must not have to know which locales exist.
 *
 * A `null` pathname means the route is not known yet. That is treated as
 * protected: the gate redirects rather than assuming the route is public.
 */
export function isPublicRoute(pathname: string | null | undefined): boolean {
  if (!pathname) {
     return false;
  }

  return PUBLIC_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * The state the gate decides on.
 *
 * These are explicit flags, never raw query flags — `isPending` is `true`
 * forever on a query with `enabled: false`, and a gate bound to it would
 * wait forever.
 */
export interface GateState {
  /** The route is reachable without a session. */
  isPublicRoute: boolean;
  /** The API answered `401` — there is no session. */
  isSignedOut: boolean;
}

/**
 * The decision the gate acts on.
 *
 * The order of the rules is the whole point:
 *
 * 1. **A public route always renders.** The login screen must not be
    *    redirected to itself, and the home screen must not bounce a
 *    visitor away before it has shown them anything.
 * 2. **A signed-out visitor is redirected.** That is the one case the gate
 *    exists for.
 *
 * ## Why there is no "wait" decision
 *
 * An earlier version of the gate held the page back — behind a skeleton —
 * until the session check came back. That was wrong for a reason that only
 * shows up under `cacheComponents`: **the session check never resolves on
 * the server.** `GET /me` is a browser request; the server has no answer
 * to give, so the server always rendered the "still checking" branch.
 *
 * Two things followed from that, and both were bad:
 *
 * - the server shipped a skeleton instead of the page, so the real content
 *   only ever existed in the client payload — and Next.js dropped the
 *   segment from the server shell entirely
 *   (`Route "/[locale]/demo": Could not validate that a segment in your UI
 *   has instant navigation. This segment was dropped from rendering.`);
 * - every protected page cost a round trip before it could show anything,
 *   which is the same round trip the header was already making.
 *
 * So the gate renders the page and redirects the moment the answer says
 * "no session". A signed-out visitor sees the page shell for a moment and
 * is then sent to the login screen — which is what a redirect is.
 *
 * ## What this means for protected data
 *
 * Because the server renders the page before it knows who is asking, a
 * page must not fetch **protected** data on the server. The data belongs
 * to a client-side query, where the browser sends the session cookie and
 * the backend can answer `401` for a request it should refuse. A server
 * component that reads a protected row would put that row in the HTML for
 * everybody.
 */
export function resolveGateDecision(state: GateState): GateDecision {
  if (state.isPublicRoute) {
    return 'render';
  }

  if (state.isSignedOut) {
    return 'redirect';
  }

  return 'render';
}
