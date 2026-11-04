/**
 * The name of the cookie that carries the session token.
 *
 * The cookie is opaque: it holds a random token, never a JWT and never
 * any claim. Only the hash of that token is stored, so a database leak
 * does not hand out live sessions.
 *
 * The name lives in the shared leaf because it is part of the wire
 * contract between the browser and the API — the guard has to read the
 * same cookie the login route writes.
 */
export const SESSION_COOKIE_NAME = 'researchos_session';

/**
 * How the session cookie is written.
 *
 * - `httpOnly` keeps the token away from JavaScript, so an XSS bug cannot
 *   read it.
 * - `secure` keeps it off plain HTTP.
 * - `sameSite: 'lax'` keeps it off cross-site requests, which is what
 *   stops a third-party page from riding the session.
 *
 * `secure` is on in every environment: on plain HTTP a browser refuses to
 * store a secure cookie, so a local development setup has to reach the API
 * over HTTPS (or through a proxy that terminates TLS).
 */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
} as const;
