import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

import type { IUserZodSchema } from '../mongo';
import type { FastifyRequest } from 'fastify';

@Injectable()
export class SuperAdminGuard implements CanActivate {
	public canActivate(context: ExecutionContext): boolean {
		const { user } = context.switchToHttp().getRequest<FastifyRequest & { user: IUserZodSchema }>();
		if (!user.superAdmin) throw new ForbiddenException('Only super admins can perform this action');
		return true;
	}
}
