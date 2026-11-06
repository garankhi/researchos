import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@researchos/database';
import { domainErrorCodes } from '@researchos/error-codes';
import { buildPaginationMeta } from '../../common/dto/pagination.dto.js';
import { CodedHttpException } from '../../common/errors/error-codes.js';
import { AccessService } from './access.service.js';
import { AccessRoleEnum } from './dto/grant-role.dto.js';
import type { CreateUserDto } from './dto/create-user.dto.js';
import type { GrantRoleDto } from './dto/grant-role.dto.js';
import type { ListUsersQueryDto } from './dto/list-users.query.dto.js';
import type { PaginatedUsersResponseDto } from './dto/paginated-users-response.dto.js';
import type { RevokeRoleDto } from './dto/revoke-role.dto.js';
import type { RoleAssignmentResponseDto } from './dto/role-assignment-response.dto.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';
import type { UserResponseDto } from './dto/user-response.dto.js';

type UserRow = Prisma.usersGetPayload<Record<string, never>>;
type RoleAssignmentRow = Prisma.user_role_assignmentsGetPayload<
  Record<string, never>
>;

/**
 * Service managing user accounts and role assignments.
 *
 * Implements CRUD for administrative user management and manages
 * lifecycle transitions for active role grants.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: AccessService,
  ) {}

  /**
   * Retrieves a paginated list of user accounts matching optional search/filter criteria.
   */
  async findAll(query: ListUsersQueryDto): Promise<PaginatedUsersResponseDto> {
    const where: Prisma.usersWhereInput = {};

    if (query.search) {
      const term = query.search.trim();
      if (term.length > 0) {
        where.OR = [
          { full_name: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
        ];
      }
    }

    if (query.userType) {
      where.user_type = query.userType;
    }

    if (query.departmentUnit) {
      const dept = query.departmentUnit.trim();
      if (dept.length > 0) {
        where.department_unit = { contains: dept, mode: 'insensitive' };
      }
    }

    if (query.isActive !== undefined) {
      where.is_active = query.isActive;
    }

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const [total, userRows] = await Promise.all([
      this.prisma.users.count({ where }),
      this.prisma.users.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
    ]);

    const userIds = userRows.map((u) => u.id);
    const rolesByUserId = new Map<string, string[]>();

    if (userIds.length > 0) {
      const accessRows = await this.prisma.$queryRaw<
        Array<{ user_id: string; is_researcher: boolean; is_admin: boolean }>
      >`
        SELECT user_id, is_researcher, is_admin
        FROM effective_user_access
        WHERE user_id IN (${Prisma.join(userIds.map((id) => Prisma.sql`${id}::uuid`))})
      `;

      for (const row of accessRows) {
        const roles: string[] = [];
        if (row.is_researcher) roles.push('RESEARCHER');
        if (row.is_admin) roles.push('ADMIN');
        rolesByUserId.set(row.user_id, roles);
      }
    }

    const items = userRows.map((u) =>
      this.mapToUserResponse(u, rolesByUserId.get(u.id) ?? []),
    );

    return {
      items,
      meta: buildPaginationMeta({ page, limit }, items.length, total),
    };
  }

  /**
   * Retrieves single user account details and effective roles.
   */
  async findOne(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.users.findUnique({
      where: { id },
    });

    if (!user) {
      throw new CodedHttpException(
        domainErrorCodes.identity.userNotFound,
        HttpStatus.NOT_FOUND,
      );
    }

    const access = await this.accessService.effectiveRoles(id);
    const roles: string[] = [];
    if (access.isResearcher) roles.push('RESEARCHER');
    if (access.isAdmin) roles.push('ADMIN');

    return this.mapToUserResponse(user, roles);
  }

  /**
   * Creates a new user account with normalized email.
   */
  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const existingEmail = await this.prisma.users.findFirst({
      where: {
        email: { equals: normalizedEmail, mode: 'insensitive' },
      },
    });

    if (existingEmail) {
      throw new CodedHttpException(
        domainErrorCodes.identity.emailAlreadyRegistered,
        HttpStatus.CONFLICT,
      );
    }

    if (dto.fptuGuid?.trim()) {
      const existingGuid = await this.prisma.users.findUnique({
        where: { fptu_guid: dto.fptuGuid.trim() },
      });
      if (existingGuid) {
        throw new CodedHttpException(
          domainErrorCodes.identity.userAlreadyExists,
          HttpStatus.CONFLICT,
        );
      }
    }

    try {
      const user = await this.prisma.users.create({
        data: {
          email: normalizedEmail,
          full_name: dto.fullName.trim(),
          user_type: dto.userType,
          department_unit: dto.departmentUnit.trim(),
          fptu_guid: dto.fptuGuid?.trim() || null,
          academic_title: dto.academicTitle?.trim() || null,
          academic_degree: dto.academicDegree?.trim() || null,
        },
      });

      const access = await this.accessService.effectiveRoles(user.id);
      const roles: string[] = [];
      if (access.isResearcher) roles.push('RESEARCHER');
      if (access.isAdmin) roles.push('ADMIN');

      return this.mapToUserResponse(user, roles);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = JSON.stringify(error.meta?.target ?? '');
        if (
          target.includes('email') ||
          target.includes('uq_users_email_normalized')
        ) {
          throw new CodedHttpException(
            domainErrorCodes.identity.emailAlreadyRegistered,
            HttpStatus.CONFLICT,
          );
        }
        throw new CodedHttpException(
          domainErrorCodes.identity.userAlreadyExists,
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  /**
   * Updates an existing user account or active status (soft-deactivate).
   */
  async update(id: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    const existing = await this.prisma.users.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new CodedHttpException(
        domainErrorCodes.identity.userNotFound,
        HttpStatus.NOT_FOUND,
      );
    }

    const data: Prisma.usersUpdateInput = {};
    if (dto.fullName !== undefined) {
      data.full_name = dto.fullName.trim();
    }
    if (dto.userType !== undefined) {
      data.user_type = dto.userType;
    }
    if (dto.departmentUnit !== undefined) {
      data.department_unit = dto.departmentUnit.trim();
    }
    if (dto.academicTitle !== undefined) {
      data.academic_title = dto.academicTitle ? dto.academicTitle.trim() : null;
    }
    if (dto.academicDegree !== undefined) {
      data.academic_degree = dto.academicDegree
        ? dto.academicDegree.trim()
        : null;
    }
    if (dto.isActive !== undefined) {
      data.is_active = dto.isActive;
    }

    const updated = await this.prisma.users.update({
      where: { id },
      data,
    });

    const access = await this.accessService.effectiveRoles(updated.id);
    const roles: string[] = [];
    if (access.isResearcher) roles.push('RESEARCHER');
    if (access.isAdmin) roles.push('ADMIN');

    return this.mapToUserResponse(updated, roles);
  }

  /**
   * Grants an access role to a target user.
   *
   * Enforces business rule: administrators cannot grant roles to themselves.
   */
  async grantRole(
    userId: string,
    dto: GrantRoleDto,
    adminId: string,
  ): Promise<RoleAssignmentResponseDto> {
    if (userId === adminId) {
      throw new CodedHttpException(
        domainErrorCodes.identity.cannotGrantSelfRole,
        HttpStatus.BAD_REQUEST,
      );
    }

    const user = await this.prisma.users.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new CodedHttpException(
        domainErrorCodes.identity.userNotFound,
        HttpStatus.NOT_FOUND,
      );
    }

    const activeGrant = await this.prisma.user_role_assignments.findFirst({
      where: {
        user_id: userId,
        role: dto.role,
        revoked_at: null,
      },
    });

    if (activeGrant) {
      throw new CodedHttpException(
        domainErrorCodes.identity.roleAlreadyGranted,
        HttpStatus.CONFLICT,
      );
    }

    try {
      const assignment = await this.prisma.user_role_assignments.create({
        data: {
          user_id: userId,
          role: dto.role,
          grant_source: 'MANUAL',
          granted_by: adminId,
          reason: dto.reason?.trim() || null,
        },
      });

      return this.mapToRoleAssignmentResponse(assignment);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new CodedHttpException(
          domainErrorCodes.identity.roleAlreadyGranted,
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  /**
   * Revokes an active access role from a target user.
   */
  async revokeRole(
    userId: string,
    role: AccessRoleEnum,
    dto: RevokeRoleDto,
    adminId: string,
  ): Promise<RoleAssignmentResponseDto> {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new CodedHttpException(
        domainErrorCodes.identity.userNotFound,
        HttpStatus.NOT_FOUND,
      );
    }

    const activeGrant = await this.prisma.user_role_assignments.findFirst({
      where: {
        user_id: userId,
        role: role,
        revoked_at: null,
      },
    });

    if (!activeGrant) {
      throw new CodedHttpException(
        domainErrorCodes.identity.roleNotGranted,
        HttpStatus.NOT_FOUND,
      );
    }

    const revoked = await this.prisma.user_role_assignments.update({
      where: { id: activeGrant.id },
      data: {
        revoked_at: new Date(),
        revoked_by: adminId,
        reason: dto.reason?.trim() || activeGrant.reason,
      },
    });

    return this.mapToRoleAssignmentResponse(revoked);
  }

  private mapToUserResponse(user: UserRow, roles: string[]): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      userType: user.user_type,
      departmentUnit: user.department_unit,
      fptuGuid: user.fptu_guid,
      academicTitle: user.academic_title,
      academicDegree: user.academic_degree,
      isActive: user.is_active,
      lastLoginAt: user.last_login_at?.toISOString() ?? null,
      roles,
    };
  }

  private mapToRoleAssignmentResponse(
    assignment: RoleAssignmentRow,
  ): RoleAssignmentResponseDto {
    return {
      id: assignment.id,
      userId: assignment.user_id,
      role: assignment.role,
      grantSource: assignment.grant_source,
      grantedBy: assignment.granted_by,
      grantedAt: assignment.granted_at.toISOString(),
      revokedBy: assignment.revoked_by,
      revokedAt: assignment.revoked_at
        ? assignment.revoked_at.toISOString()
        : null,
      reason: assignment.reason,
    };
  }
}
