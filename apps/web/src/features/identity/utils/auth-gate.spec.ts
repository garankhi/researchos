import { describe, expect, it } from 'vitest';
import {
  PUBLIC_ROUTE_PREFIXES,
  isPublicRoute,
  resolveGateDecision,
} from './auth-gate';

/**
 * The auth gate rules.
 *
 * The gate is the platform-wide rule that only signed-in users reach the
 * product. Two things can go wrong and both are silent: the gate lets a
 * signed-out visitor through, or it sends a signed-in visitor to the login
 * screen. The second is worse — it is a loop the visitor cannot get out of
 * — so the rules are pinned here rather than only exercised by hand.
 */
describe('isPublicRoute', () => {
  it('keeps the login screen reachable', () => {
    expect(isPublicRoute('/login')).toBe(true);
  });

  it('keeps the home screen reachable', () => {
    // The home screen answers "who am I?" itself — a signed-out visitor
    // gets a sign-in button, not a redirect to a login form with no
    // explanation of what they were trying to reach.
    expect(isPublicRoute('/')).toBe(true);
  });

  it('protects every other route', () => {
    expect(isPublicRoute('/demo')).toBe(false);
    expect(isPublicRoute('/profiles')).toBe(false);
    expect(isPublicRoute('/opportunities/123')).toBe(false);
  });

  it('matches on a path segment boundary', () => {
    // `/demographics` starts with `/demo` as a string but is a different
    // route, and it must not be treated as public.
    expect(isPublicRoute('/demographics')).toBe(false);
    expect(isPublicRoute('/login-history')).toBe(false);
  });

  it('treats an unknown pathname as protected', () => {
    // The gate must redirect rather than assume the route is public.
    expect(isPublicRoute(null)).toBe(false);
    expect(isPublicRoute(undefined)).toBe(false);
    expect(isPublicRoute('')).toBe(false);
  });

  it('lists only the two public prefixes', () => {
    expect([...PUBLIC_ROUTE_PREFIXES]).toEqual(['/login', '/']);
  });
});

describe('resolveGateDecision', () => {
  const protectedRoute = {
    isPublicRoute: false,
    isSignedOut: false,
  };

  it('renders a public route without a session', () => {
    // The login screen must never redirect to itself.
    expect(
      resolveGateDecision({
        isPublicRoute: true,
        isSignedOut: true,
      }),
    ).toBe('render');
  });

  it('redirects a signed-out visitor', () => {
    expect(
      resolveGateDecision({
        ...protectedRoute,
        isSignedOut: true,
      }),
    ).toBe('redirect');
  });

  it('renders a signed-in visitor', () => {
    expect(resolveGateDecision(protectedRoute)).toBe('render');
  });

  it('renders when the API is unreachable', () => {
    // A failed request is not the same as not being signed in. Redirecting
    // to the login screen because the API is down sends the visitor into a
    // loop they cannot get out of.
    expect(resolveGateDecision(protectedRoute)).toBe('render');
  });

  it('never waits for the session', () => {
    // There is no "wait" decision. The session check is a browser request,
    // so the server never gets an answer and always rendered the waiting
    // branch — which dropped the page from the server shell entirely
    // ("This segment was dropped from rendering"). The page renders first
    // and the redirect happens when the answer arrives.
    expect(resolveGateDecision(protectedRoute)).not.toBe('wait');
  });
});
