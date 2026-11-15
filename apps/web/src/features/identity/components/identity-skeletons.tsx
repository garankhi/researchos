import { Container } from '@chakra-ui/react';
import type { SkeletonResult } from 'boneyard-js';
import { DelayedSkeleton } from '@/components/ui/delayed-skeleton';

/**
 * The layout of the session check that runs before a protected page
 * renders.
 *
 * It mirrors the sign-in prompt the guard shows when the visitor is not
 * signed in — the icon, the heading, the description and the button.
 */
const sessionCheck: SkeletonResult = {
  name: 'require-auth-session-check',
  viewportWidth: 390,
  width: 480,
  height: 164,
  bones: [
    [46, 0, 8, 32, 0],
    [25, 46, 50, 28, 0],
    [8, 88, 84, 16, 0],
    [33, 122, 34, 40, 0],
  ],
};

/**
 * The layout of the signed-in summary.
 *
 * It mirrors the real content — a name, an email, a row of role badges and
 * the sign-out button — so the space is reserved from the first paint.
 */
const sessionSummary: SkeletonResult = {
  name: 'identity-session-summary',
  viewportWidth: 390,
  width: 260,
  height: 116,
  bones: [
    [0, 0, 68, 20, 0],
    [0, 30, 92, 14, 0],
    [0, 56, 54, 20, 0],
    [0, 84, 44, 32, 0],
  ],
};

/**
 * The layout of the login form.
 *
 * The form is two labelled inputs and a full-width submit button, so the
 * fallback reserves exactly that space.
 */
const loginForm: SkeletonResult = {
  name: 'login-form',
  viewportWidth: 390,
  width: 320,
  height: 136,
  bones: [
    [0, 0, 34, 14, 0],
    [0, 22, 100, 40, 0],
    [0, 70, 34, 14, 0],
    [0, 92, 100, 40, 0],
  ],
};

/** The skeleton shown while the session is being checked. */
export function SessionCheckSkeleton() {
  return (
    <Container as="main" maxW="lg" py="8">
      <DelayedSkeleton layout={sessionCheck} />
    </Container>
  );
}

/** The skeleton shown while the signed-in summary is loading. */
export function SessionSummarySkeleton() {
  return <DelayedSkeleton layout={sessionSummary} />;
}

/** The skeleton shown while the login form is resolving. */
export function LoginFormSkeleton() {
  return <DelayedSkeleton layout={loginForm} />;
}
