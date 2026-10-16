import {
	type CanActivate,
	type ExecutionContext,
	ForbiddenException,
	Injectable,
	NotFoundException,
	UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

import { MongoUserService, type IUserZodSchema } from '../mongo';

import type { FastifyRequest } from 'fastify';

export interface AccessTokenPayload {
	id: string;
	sid: string;
}

export const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1_000;

export const sessionCutoff = () => new Date(Date.now() - SESSION_TTL_MS);

@Injectable()
export class AuthGuard implements CanActivate {
	public constructor(
		private readonly userService: MongoUserService,
		private readonly jwtService: JwtService,
		private readonly reflector: Reflector,
	) {}

	public async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest<FastifyRequest & { user?: IUserZodSchema }>();
		const isAuthOptional = this.reflector.get<boolean | undefined>('optionalAuth', context.getHandler());

		const token = this.extractTokenFromHeader(request);
		if (!token) {
			if (isAuthOptional) return true;
			throw new UnauthorizedException();
		}

		let payload: AccessTokenPayload;
		try {
			payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
		} catch {
			throw new UnauthorizedException();
		}

		const user = await this.userService.findOne({
			id: payload.id,
			sessions: { $elemMatch: { id: payload.sid, createdAt: { $gt: sessionCutoff() } } },
		});
		if (!user) throw new UnauthorizedException('Invalid session');
		if (user.deleted) throw new NotFoundException('User not found');
		if (user.status !== 'Accepted') throw new ForbiddenException('Your account is not active.');

		request.user = user;
		// @fastify/middie runs Nest middleware against `req.raw`, so the logger reads the user from there.
		Object.assign(request.raw, { user });

		return true;
	}

	private extractTokenFromHeader(request: FastifyRequest): string | undefined {
		const [type, token] = request.headers.authorization?.split(' ') ?? [];
		return type === 'Bearer' ? token : undefined;
	}
}
