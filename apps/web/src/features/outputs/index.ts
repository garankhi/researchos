/**
 * Outputs feature — public entry point.
 *
 * This barrel is the only import surface other modules should use.
 */

export { useOutput } from './hooks/use-output';
export { useOutputCapability } from './hooks/use-output-capability';
export { useOutputFiles } from './hooks/use-output-files';
export { useOutputGroup } from './hooks/use-output-group';
export { useOutputVisibility } from './hooks/use-output-visibility';
export { ArticleCreationFlow } from './components/article-creation-flow';
export { OutputDetailActionsMenu } from './components/output-detail-actions-menu';
export { OutputDetailShell } from './components/output-detail-shell';
export { OutputHeader } from './components/output-header';
export { OutputAbstract } from './components/output-abstract';
export { OutputReferences } from './components/output-references';
export {
  OutputCard,
  toOutputCardData,
  type OutputCardData,
  type OutputCardAuthor,
  type OutputCardTopic,
} from './components/output-card';
export {
  OutputDownloadPrimaryButton,
  OutputFiles,
  OutputShareButton,
} from './components/output-actions';
export { OutputDetailSkeleton } from './components/output-skeletons';
export type {
  OutputAuthor,
  OutputDetail,
  OutputFile,
  OutputRevisionSummary,
  OutputTopic,
} from './types';
