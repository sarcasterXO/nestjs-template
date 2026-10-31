import { setInterval } from 'node:timers';

import { HttpException, HttpStatus, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';

import { TokenBucket } from '../util/TokenBucket';
import { clientIp } from '../util/Util';

import type { IUserZodSchema } from '../mongo';
import type { FastifyRequest } from 'fastify';

const IDLE_BUCKET_TTL_MS = 10 * 60 * 1_000;
const SWEEP_INTERVAL_MS = 60 * 1_000;

const buckets = new Map<string, { bucket: TokenBucket; lastSeen: number }>();

setInterval(() => {
	const idleSince = Date.now() - IDLE_BUCKET_TTL_MS;
	for (const [key, entry] of buckets) if (entry.lastSeen < idleSince) buckets.delete(key);
}, SWEEP_INTERVAL_MS).unref();

/**
 * Per-user (or per-IP when anonymous) token bucket for one route. `@Auth()` always runs its guard first,
 * so on authenticated routes this keys on the user. Pass `keyOf` to key on something else, e.g. the email a login
 * targets; it runs before validation, so it gets the raw request, and returning `undefined` skips the limit.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
	public constructor(
		private readonly bucketSize: number,
		private readonly maxTokenUsePerSecond: number,
		private readonly keyOf?: (request: FastifyRequest) => string | undefined,
	) {}

	public canActivate(context: ExecutionContext): boolean {
		const request = context.switchToHttp().getRequest<FastifyRequest & { user?: IUserZodSchema }>();
		const subject = this.keyOf ? this.keyOf(request) : (request.user?.id ?? clientIp(request));
		if (subject === undefined) return true;

		const key = `${subject}:${request.method}:${request.routeOptions.url ?? request.url}`;
		const now = Date.now();

		let entry = buckets.get(key);
		if (!entry) {
			entry = { bucket: new TokenBucket(this.bucketSize, this.maxTokenUsePerSecond), lastSeen: now };
			buckets.set(key, entry);
		}
		entry.lastSeen = now;

		if (!entry.bucket.takeToken()) throw new HttpException('You are being rate limited.', HttpStatus.TOO_MANY_REQUESTS);
		return true;
	}
}
