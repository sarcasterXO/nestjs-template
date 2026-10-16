import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PermissionLabels, permissionsFor, type Permission } from '../util/Permissions';

import type { IUserZodSchema } from '../mongo';
import type { FastifyRequest } from 'fastify';

export const RequiredPermissions = Reflector.createDecorator<Permission[][]>();

@Injectable()
export class PermissionsGuard implements CanActivate {
	public constructor(private readonly reflector: Reflector) {}

	public canActivate(context: ExecutionContext): boolean {
		const groups = this.reflector.get(RequiredPermissions, context.getHandler());
		const { user } = context.switchToHttp().getRequest<FastifyRequest & { user: IUserZodSchema }>();

		const granted = permissionsFor(user);
		if (groups.some((group) => group.every((permission) => granted.has(permission)))) return true;

		const labels = groups.map((group) => group.map((permission) => PermissionLabels[permission]).join(' + '));
		throw new ForbiddenException(
			labels.length === 1
				? `Missing required permissions: ${labels[0]}`
				: `Missing required permissions. You need one of: ${labels.join(' OR ')}`,
		);
	}
}
