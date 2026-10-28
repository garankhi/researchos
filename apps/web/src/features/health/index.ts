/**
 * Health feature — public entry point.
 *
 * This barrel is the only import surface other modules should use. Import
 * from `@/features/health` rather than reaching into the subfolders, so the
 * internal layout can change without rippling through the app.
 */

export { useApiHealth } from './hooks/use-api-health';
export type { ApiHealth } from './types';
