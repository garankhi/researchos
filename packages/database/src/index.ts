/**
 * Public surface of `@researchos/database`.
 *
 * Consumers import from here, not from `src/generated/...`, so the generated
 * client path stays an implementation detail of this package.
 */

export { PrismaModule } from './prisma.module.js';
export { PrismaService } from './prisma.service.js';

// The generated enums are part of the domain contract: feature modules use
// them for DTOs and query filters.
export {
  PublicationStatus,
  SourceKind,
  VerificationStatus,
  Visibility,
} from './generated/prisma/client.js';

export { Prisma } from './generated/prisma/client.js';
