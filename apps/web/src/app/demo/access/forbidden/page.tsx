import { forbidden } from 'next/navigation';

/**
 * Triggers the `forbidden.tsx` boundary by calling `forbidden()`.
 *
 * Requires `experimental.authInterrupts: true` in next.config.ts.
 */
export default function ForbiddenDemoPage() {
  forbidden();
}
