import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import {
	type PermissionGroupsDto,
	PermissionGroupsDtoSchema,
	type RolesDto,
	RolesDtoSchema,
} from './roles.response.dto';

import { RequirePermissions } from '../lib/decorators/auth.decorator';
import { Swagger } from '../lib/decorators/swagger.decorator';
import { RateLimitGuard } from '../lib/guard/rateLimitGuard.guard';
import { PermissionGroups, Permissions, RoleNames, Roles } from '../lib/util/Permissions';

@ApiTags('Roles')
@Controller('roles')
export class RolesController {
	// ==================== GET ROUTES ====================

	@Swagger('Get all roles with their permissions', RolesDtoSchema)
	@UseGuards(new RateLimitGuard(20, 1))
	@RequirePermissions([Permissions.Roles.View])
	@Get()
	public getRoles(): RolesDto {
		return RoleNames.map((name) => ({ name, ...Roles[name] }));
	}

	@Swagger('Get every permission, grouped by category', PermissionGroupsDtoSchema)
	@UseGuards(new RateLimitGuard(20, 1))
	@RequirePermissions([Permissions.Roles.View])
	@Get('permissions')
	public getPermissions(): PermissionGroupsDto {
		return PermissionGroups;
	}
}
