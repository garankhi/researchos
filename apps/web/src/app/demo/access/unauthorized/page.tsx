import { unauthorized } from 'next/navigation';

/**
 * Triggers the `unauthorized.tsx` boundary by calling `unauthorized()`.
 *
 * Requires `experimental.authInterrupts: true` in next.config.ts.
 */
export default function UnauthorizedDemoPage() {
  unauthorized();
}
