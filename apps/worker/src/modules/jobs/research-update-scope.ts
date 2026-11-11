import { createHash } from 'node:crypto';

export function researchUpdateScope(prefix: string): string {
  // Match enqueue_research_update() in PostgreSQL. The leading @ keeps this
  // outside the legacy QUEUE_PREFIX namespace.
  return `@research-updates:${createHash('sha256').update(prefix).digest('hex')}`;
}
