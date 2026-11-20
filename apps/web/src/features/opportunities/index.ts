/**
 * Opportunities feature — public entry point.
 *
 * This barrel is the only import surface other modules should use. Import
 * from `@/features/opportunities` rather than reaching into the subfolders,
 * so the internal layout can change without rippling through the app.
 */

export { OpportunityDetailShell } from './components/opportunity-detail-shell';
export { OpportunityDetailSkeleton } from './components/opportunity-skeletons';
export { OpportunityHeader } from './components/opportunity-header';
export { OpportunitySidebar } from './components/opportunity-sidebar';
export { useOpportunity } from './hooks/use-opportunity';
export { opportunityPermissions } from './types';
export type { Opportunity, OpportunityTab } from './types';
