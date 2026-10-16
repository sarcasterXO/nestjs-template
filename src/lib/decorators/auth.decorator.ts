import { SetMetadata, UseGuards, applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiHeader, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { ErrorDtoSchema } from '../dtos/response.dto';
import { AuthGuard } from '../guard/auth.guard';
import { PermissionsGuard, RequiredPermissions } from '../guard/permissions.guard';
import { SuperAdminGuard } from '../guard/superAdmin.guard';

import type { Permission } from '../util/Permissions';

export function Auth(optional?: boolean) {
	return applyDecorators(
		UseGuards(AuthGuard),
		ApiBearerAuth(),
		ApiUnauthorizedResponse({ description: 'Unauthorized', standardSchema: ErrorDtoSchema }),
		ApiHeader({
			name: 'Authorization',
			description: 'Bearer <Token>',
			schema: {
				type: 'string',
			},
			required: !optional,
		}),
		SetMetadata('optionalAuth', optional),
	);
}

export function SuperAdmin() {
	return applyDecorators(Auth(), UseGuards(SuperAdminGuard));
}

/** Each argument is an AND-group of permissions; the groups are OR'd. Super admins pass every check. */
export function RequirePermissions(...groups: [Permission[], ...Permission[][]]) {
	return applyDecorators(
		Auth(),
		RequiredPermissions(groups),
		UseGuards(PermissionsGuard),
		ApiForbiddenResponse({ description: 'Missing required permissions', standardSchema: ErrorDtoSchema }),
	);
}
