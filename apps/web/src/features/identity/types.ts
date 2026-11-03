import type { MeDto } from '@/lib/api/models';

/**
 * Domain types for the identity feature.
 *
 * These are the shapes the UI actually consumes. They are derived from the
 * generated API models but kept separate, so a backend field rename surfaces
 * here first instead of silently changing every component.
 */

/**
 * The signed-in account.
 *
 * The roles are the **live** roles the backend read for this request — not
 * a snapshot of what the session was created with — so a revoked grant
 * takes effect on the next call.
 */
export interface CurrentUser {
  /** The account's id. */
  id: string;
  /** The account's email address, normalized by the backend. */
  email: string;
  /** The account's display name. */
  fullName: string;
  /** The kind of account — `FACULTY`, `STUDENT` or `STAFF`. */
  userType: string;
  /** The department or unit the account belongs to. */
  departmentUnit: string;
  /** The academic title, when the account has one. */
  academicTitle: string | null;
  /** The academic degree, when the account has one. */
  academicDegree: string | null;
  /** The roles the account currently holds. */
  roles: string[];
  /** Whether the account finished the onboarding. */
  onboardingCompleted: boolean;
  /** Whether the account confirmed its profile. */
  profileConfirmed: boolean;
  /**
   * Whether the account must change its password before it can use the rest
   * of the API.
   */
  mustChangePassword: boolean;
}

/**
 * Maps the generated DTO onto the domain type.
 *
 * The mapping is explicit rather than a spread, so a field added to the
 * DTO has to be considered here instead of silently flowing through.
 */
export function toCurrentUser(dto: MeDto): CurrentUser {
  return {
    id: dto.id,
    email: dto.email,
    fullName: dto.fullName,
    userType: dto.userType,
    departmentUnit: dto.departmentUnit,
    academicTitle: dto.academicTitle,
    academicDegree: dto.academicDegree,
    roles: [...dto.roles],
    onboardingCompleted: dto.onboardingCompleted,
    profileConfirmed: dto.profileConfirmed,
    mustChangePassword: dto.mustChangePassword,
  };
}

/**
 * The credentials a local login sends.
 *
 * The email is normalized by the backend, so the case and the surrounding
 * spaces do not matter to the caller.
 */
export interface LoginCredentials {
  email: string;
  password: string;
}
