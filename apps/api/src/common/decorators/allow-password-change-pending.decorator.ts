import { SetMetadata } from '@nestjs/common';

export const ALLOW_PASSWORD_CHANGE_PENDING_KEY =
  'researchos:allow-password-change-pending';

/** Method-only exception for session inspection, password change and logout.
 * Authentication and role checks still apply. Never put this on business APIs. */
export const AllowPasswordChangePending = (): MethodDecorator =>
  SetMetadata(ALLOW_PASSWORD_CHANGE_PENDING_KEY, true);
