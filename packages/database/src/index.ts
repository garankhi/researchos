/**
 * Public surface of `@researchos/database`.
 *
 * Consumers import from here, not from `src/generated/...`, so the generated
 * client path stays an implementation detail of this package.
 */

export { PrismaModule } from './prisma.module.js';
export { PrismaService } from './prisma.service.js';
export {
  BackgroundJobsService,
  RESEARCH_UPDATE_JOB,
} from './background-jobs.service.js';

// The generated enums are part of the domain contract: feature modules use
// them for DTOs and query filters.
export {
  claim_status as ClaimStatus,
  interest_source,
  interest_status,
  entity_types as FollowEntityType,
  group_member_role as GroupMemberRole,
  opportunity_kind as OpportunityKind,
  opportunity_status as OpportunityStatus,
  output_import_state as OutputImportState,
  search_entity_type as SearchEntityType,
  target_audience as TargetAudience,
  data_provenance_type as DataProvenanceType,
  output_sharing_status as OutputSharingStatus,
  publication_status as PublicationStatusEnum,
  PublicationStatus,
  SourceKind,
  VerificationStatus,
  Visibility,
  visibility_level as OutputFileVisibility,
} from './generated/prisma/client.js';
export type { data_provenance_type as DataProvenance } from './generated/prisma/client.js';

export { Prisma } from './generated/prisma/client.js';
export type {
  research_opportunities as ResearchOpportunity,
  research_outputs as ResearchOutput,
  output_revisions as OutputRevision,
  output_authors as OutputAuthor,
  output_files as OutputFile,
} from './generated/prisma/client.js';
