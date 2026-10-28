/**
 * Domain types for the health feature.
 *
 * These are the shapes the UI actually consumes. They are derived from the
 * generated API models but kept separate, so a backend field rename surfaces
 * here first instead of silently changing every component.
 */

/**
 * Availability snapshot of the ResearchOS API.
 */
export interface ApiHealth {
  /** Coarse status reported by the API, e.g. "ok". */
  status: string;
  /** Service name the API identifies itself as. */
  service: string;
  /** Process uptime in seconds. */
  uptimeSeconds: number;
  /** Server-side timestamp of the check. */
  timestamp: string;
}
