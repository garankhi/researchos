/**
 * Outputs feature — public entry point.
 *
 * This barrel is the only import surface other modules should use.
 */

export { useOutput } from './hooks/use-output';
export { useOutputFiles } from './hooks/use-output-files';
export { OutputDetailShell } from './components/output-detail-shell';
export { OutputHeader } from './components/output-header';
export { OutputAbstract } from './components/output-abstract';
export { OutputReferences } from './components/output-references';
export { OutputActions, OutputFiles } from './components/output-actions';
export type {
  OutputAuthor,
  OutputDetail,
  OutputFile,
  OutputRevisionSummary,
  OutputTopic,
} from './types';
