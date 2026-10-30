/**
 * Public surface of `@researchos/database`.
 *
 * Consumers import from here, not from `src/generated/...`, so the generated
 * client path stays an implementation detail of this package.
 */

export { PrismaModule } from './prisma.module.js';
export { PrismaService } from './prisma.service.js';

// The generated enums are part of the domain contract: feature modules use
// them for DTOs and query filters. The list mirrors the enums of
// `ResearchOS.sql`, which is the source of truth for the schema.
export {
  AccessRole,
  AvailabilityStatusType,
  ClaimStatus,
  DataProvenanceType,
  DeliveryStatus,
  DigestSubjectType,
  EdgeType,
  EdgeValidationStatus,
  EntityTypes,
  ExpectedRoleType,
  GroupMemberRole,
  GroupOutputStatus,
  InterestSource,
  InterestStatus,
  MilestoneStatus,
  OpportunityApplicationStatus,
  OpportunityKind,
  OpportunityStatus,
  OutputSharingStatus,
  PostType,
  ProjectStatus,
  ProjectType,
  PublicationStatus,
  RecordStatus,
  ResearchUpdateType,
  SeminarType,
  TargetAudience,
  TaxonomySource,
  UserType,
  VisibilityLevel,
} from './generated/prisma/client.js';

export { Prisma } from './generated/prisma/client.js';
