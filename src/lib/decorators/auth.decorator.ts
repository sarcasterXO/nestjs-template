import { SetMetadata, UseGuards, applyDecorators } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ApiBearerAuth, ApiForbiddenResponse, ApiHeader, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { ErrorDtoSchema } from '../dtos/response.dto';
import { AuthGuard } from '../guard/auth.guard';
import { PermissionsGuard, RequiredPermissions } from '../guard/permissions.guard';
import { SuperAdminGuard } from '../guard/superAdmin.guard';

import type { Permission } from '../util/Permissions';

/**
 * `UseGuards(AuthGuard)`, but ahead of the handler's other guards whatever the decorator order, so a
 * `RateLimitGuard` keys on the authenticated user rather than the IP.
 */
const useAuthGuardFirst: ClassDecorator & MethodDecorator = (
	target: object,
	_key?: string | symbol,
	descriptor?: PropertyDescriptor,
) => {
	const holder = descriptor?.value ?? target;
	const existing: unknown[] = Reflect.getMetadata(GUARDS_METADATA, holder) ?? [];
	Reflect.defineMetadata(GUARDS_METADATA, [AuthGuard, ...existing], holder);
};

export function Auth(optional?: boolean) {
	return applyDecorators(
		useAuthGuardFirst,
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
