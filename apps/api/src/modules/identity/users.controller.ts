import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { AccessRoleEnum, GrantRoleDto } from './dto/grant-role.dto.js';
import { ListUsersQueryDto } from './dto/list-users.query.dto.js';
import { PaginatedUsersResponseDto } from './dto/paginated-users-response.dto.js';
import { RevokeRoleDto } from './dto/revoke-role.dto.js';
import { RoleAssignmentResponseDto } from './dto/role-assignment-response.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UserResponseDto } from './dto/user-response.dto.js';
import { UsersService } from './users.service.js';

/**
 * Controller exposing administrative endpoints for user management and role assignments.
 *
 * All endpoints require authentication and the ADMIN role.
 */
@ApiTags('identity')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({
    summary: 'List user accounts with pagination and filtering',
    description:
      'Returns a paginated list of user accounts with effective roles. Accessible to administrators only.',
  })
  @ApiOkResponse({
    description: 'Paginated user list retrieved successfully.',
    type: PaginatedUsersResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid query parameters or sort expression.',
  })
  @Get()
  async findAll(
    @Query() query: ListUsersQueryDto,
  ): Promise<PaginatedUsersResponseDto> {
    return this.usersService.findAll(query);
  }

  @ApiOperation({
    summary: 'Get user account details',
    description:
      'Returns details and live effective roles for the specified user account.',
  })
  @ApiParam({
    name: 'id',
    description: 'Unique identifier of the user account (UUID).',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'User details retrieved successfully.',
    type: UserResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'The provided user ID is not a valid UUID.',
  })
  @ApiNotFoundResponse({
    description: 'The requested user was not found.',
  })
  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UserResponseDto> {
    return this.usersService.findOne(id);
  }

  @ApiOperation({
    summary: 'Create a new user account',
    description:
      'Provisions a new user account with normalized email. Accessible to administrators only.',
  })
  @ApiCreatedResponse({
    description: 'User created successfully.',
    type: UserResponseDto,
  })
  @ApiConflictResponse({
    description:
      'A user with this email or institutional identifier already exists.',
  })
  @Post()
  async create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(dto);
  }

  @ApiOperation({
    summary: 'Update user account details or status',
    description:
      'Updates user fields or active status. Deactivating an account revokes all active sessions.',
  })
  @ApiParam({
    name: 'id',
    description: 'Unique identifier of the user account (UUID).',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'User updated successfully.',
    type: UserResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Invalid update payload, invalid UUID, or attempt to deactivate the last active administrator.',
  })
  @ApiNotFoundResponse({
    description: 'The requested user was not found.',
  })
  @ApiConflictResponse({
    description:
      'A user with this email or institutional identifier already exists.',
  })
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.update(id, dto);
  }

  @ApiOperation({
    summary: 'Grant access role to user',
    description:
      'Grants an access role (RESEARCHER or ADMIN) to the target user. Administrators cannot grant roles to themselves.',
  })
  @ApiParam({
    name: 'id',
    description: 'Unique identifier of the user account (UUID).',
    format: 'uuid',
  })
  @ApiCreatedResponse({
    description: 'Role granted successfully.',
    type: RoleAssignmentResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Administrators cannot grant roles to themselves.',
  })
  @ApiNotFoundResponse({
    description: 'The requested user was not found.',
  })
  @ApiConflictResponse({
    description: 'The user already holds this active role.',
  })
  @Post(':id/roles')
  async grantRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GrantRoleDto,
    @CurrentUserId() adminId: string,
  ): Promise<RoleAssignmentResponseDto> {
    return this.usersService.grantRole(id, dto, adminId);
  }

  @ApiOperation({
    summary: 'Revoke access role from user',
    description:
      'Revokes an active access role from the specified user account.',
  })
  @ApiParam({
    name: 'id',
    description: 'Unique identifier of the user account (UUID).',
    format: 'uuid',
  })
  @ApiParam({
    name: 'role',
    description: 'The access role to revoke.',
    enum: AccessRoleEnum,
  })
  @ApiOkResponse({
    description: 'Role revoked successfully.',
    type: RoleAssignmentResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Cannot revoke the ADMIN role from the last active administrator or revocation timestamp violates grant constraint.',
  })
  @ApiNotFoundResponse({
    description: 'User or active role grant was not found.',
  })
  @HttpCode(HttpStatus.OK)
  @Delete(':id/roles/:role')
  async revokeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('role', new ParseEnumPipe(AccessRoleEnum)) role: AccessRoleEnum,
    @Body() dto: RevokeRoleDto,
    @CurrentUserId() adminId: string,
  ): Promise<RoleAssignmentResponseDto> {
    return this.usersService.revokeRole(id, role, dto, adminId);
  }
}
