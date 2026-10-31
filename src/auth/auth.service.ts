import { createHash, randomBytes } from 'node:crypto';

import { BadRequestException, ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';

import { SESSION_TTL_MS, sessionCutoff, type AccessTokenPayload } from '../lib/guard/auth.guard';
import { MongoUserService, MongoAuditLogService } from '../lib/mongo';
import { generateFlake } from '../lib/util/Snowflake';

import type { IUserZodSchema } from '../lib/mongo/zod';
import type { ChangePasswordDto, LoginDto, RegisterDto } from './auth.request.dto';

interface RefreshTokenPayload extends AccessTokenPayload {
	rid: string;
}

type Session = IUserZodSchema['sessions'][number];

const REGISTER_MESSAGE = 'Registration received. Your account is pending admin approval.';

const hashRefreshId = (rid: string) => createHash('sha256').update(rid).digest('hex');

/** Hash of a random password, verified against when the email is unknown so both paths take as long. */
const DUMMY_PASSWORD_HASH =
	'$argon2id$v=19$m=65536,p=4,t=3$a1XVpdkScwiMahBsab5rHg$w8Gk+27xap42u+E1B04LVzSOrwd2DRD0GGEtUuesXDM';

@Injectable()
export class AuthService {
	private readonly logger = new Logger(AuthService.name);
	private readonly MAX_SESSIONS = 3;
	private readonly refreshSecret: string;

	public constructor(
		private readonly userService: MongoUserService,
		private readonly jwtService: JwtService,
		private readonly auditService: MongoAuditLogService,
		configService: ConfigService,
	) {
		this.refreshSecret = configService.getOrThrow<string>('JWT_REFRESH_SECRET');
	}

	public async register({ name, email, password: plainPassword }: RegisterDto, ip: string) {
		// Hashed up front and the reply is the same either way, so neither the body nor the timing reveals a registered email.
		const password = await argon2.hash(plainPassword);

		let user;
		try {
			if (await this.userService.exists({ email })) throw new BadRequestException('Document already exists');
			user = await this.userService.create({
				name,
				email,
				password,
				status: 'Requested',
				deleted: false,
				superAdmin: false,
			});
		} catch (error) {
			// `create` throws the same BadRequestException when a concurrent registration wins the unique index.
			if (!(error instanceof BadRequestException)) throw error;
			this.logger.warn(`Registration rejected, email already registered: ${email} - IP: ${ip}`);
			return { message: REGISTER_MESSAGE };
		}

		void this.audit({
			user: { id: user.id, name: user.name },
			action: 'user created',
			message: `User Registered: "${user.name}" (ID: ${user.id}) - IP: ${ip} - awaiting admin approval`,
			documentId: user.id,
		});

		return { message: REGISTER_MESSAGE };
	}

	public async login({ email, password: plainPassword }: LoginDto, userAgent?: string) {
		const user = await this.userService.findOne({ email, deleted: { $ne: true } }, ['+password']);
		if (!user) {
			await argon2.verify(DUMMY_PASSWORD_HASH, plainPassword);
			throw new UnauthorizedException('Invalid email or password.');
		}

		const isValidPassword = await argon2.verify(user.password, plainPassword);
		if (!isValidPassword) throw new UnauthorizedException('Invalid email or password.');

		if (user.status === 'Requested') {
			throw new ForbiddenException('Your account is pending admin approval.');
		}
		if (user.status === 'Rejected') {
			throw new ForbiddenException('Your account request was rejected.');
		}
		if (user.status === 'Deactivated') {
			throw new ForbiddenException('Your account has been deactivated.');
		}

		const now = new Date();
		const refreshId = randomBytes(32).toString('base64url');
		const session: Session = {
			id: generateFlake(),
			refreshHash: hashRefreshId(refreshId),
			// Pipeline updates aren't cast, so an undefined field would be stored as null.
			...(userAgent ? { userAgent } : {}),
			createdAt: now,
			lastUsedAt: now,
		};

		// One write: drop expired sessions, add the new one, keep the most recently used. `$literal` keeps the
		// client-sent user agent from being read as a `$field` path.
		const updatedUser = await this.userService.updateOne(
			{ id: user.id },
			[
				{
					$set: {
						lastLoginAt: now,
						sessions: {
							$slice: [
								{
									$sortArray: {
										input: {
											$concatArrays: [
												{
													$filter: {
														input: { $ifNull: ['$sessions', []] },
														cond: { $gt: ['$$this.createdAt', sessionCutoff()] },
													},
												},
												{ $literal: [session] },
											],
										},
										sortBy: { lastUsedAt: 1 },
									},
								},
								-this.MAX_SESSIONS,
							],
						},
					},
				},
			],
			{ updatePipeline: true },
		);
		if (!updatedUser) throw new UnauthorizedException('Invalid email or password.');

		void this.audit({
			user: { id: user.id, name: user.name },
			action: 'user login',
			message: `User Login: "${user.name}" (ID: ${user.id})`,
			documentId: user.id,
		});

		return { ...updatedUser, ...this.signTokens(user.id, session.id, refreshId, SESSION_TTL_MS / 1_000) };
	}

	public async changePassword(userId: string, { currentPassword, newPassword }: ChangePasswordDto) {
		const user = await this.userService.findOne({ id: userId }, ['+password']);
		if (!user) throw new UnauthorizedException();

		const isValidPassword = await argon2.verify(user.password, currentPassword);
		if (!isValidPassword) throw new BadRequestException('Current password is incorrect.');

		const password = await argon2.hash(newPassword);
		await this.userService.updateOne({ id: userId }, { password, sessions: [] });

		void this.audit({
			user: { id: user.id, name: user.name },
			action: 'user updated',
			message: `User Changed Password: "${user.name}" (ID: ${user.id})`,
			documentId: user.id,
		});

		return { message: 'Password changed successfully. Please log in again.' };
	}

	/**
	 * Rotates the session's refresh id. A refresh token whose id was already rotated is a replay,
	 * so the whole session is revoked.
	 */
	public async refresh(refreshToken: string) {
		let payload: RefreshTokenPayload & { exp: number };
		try {
			payload = this.jwtService.verify<RefreshTokenPayload & { exp: number }>(refreshToken, {
				secret: this.refreshSecret,
			});
		} catch {
			throw new UnauthorizedException('Invalid refresh token');
		}

		const refreshId = randomBytes(32).toString('base64url');
		const user = await this.userService.updateOne(
			{
				id: payload.id,
				deleted: { $ne: true },
				status: 'Accepted',
				sessions: {
					$elemMatch: {
						id: payload.sid,
						refreshHash: hashRefreshId(payload.rid),
						createdAt: { $gt: sessionCutoff() },
					},
				},
			},
			{ $set: { 'sessions.$.refreshHash': hashRefreshId(refreshId), 'sessions.$.lastUsedAt': new Date() } },
		);

		if (!user) {
			await this.userService.updateOne({ id: payload.id }, { $pull: { sessions: { id: payload.sid } } });
			throw new UnauthorizedException('Invalid refresh token');
		}

		// Keep the original exp so refreshing never extends the session past its absolute limit.
		const refreshExpiresIn = payload.exp - Math.floor(Date.now() / 1_000);
		return { ...user, ...this.signTokens(user.id, payload.sid, refreshId, refreshExpiresIn) };
	}

	public async logout(user: Pick<IUserZodSchema, 'id' | 'name'>, accessToken: string) {
		const { sid } = this.jwtService.decode<AccessTokenPayload>(accessToken);
		await this.userService.updateOne({ id: user.id }, { $pull: { sessions: { id: sid } } });

		void this.audit({
			user: { id: user.id, name: user.name },
			action: 'user logout',
			message: `User Logout: "${user.name}" (ID: ${user.id})`,
			documentId: user.id,
		});

		return { message: 'Logged out successfully' };
	}

	/** Fire-and-forget, so a failed write is logged rather than left as an unhandled rejection. */
	private async audit(entry: Parameters<MongoAuditLogService['create']>[0]) {
		try {
			await this.auditService.create(entry);
		} catch (error) {
			this.logger.error(`Failed to write audit log "${entry.message}"`, error);
		}
	}

	private signTokens(userId: string, sid: string, rid: string, refreshExpiresIn: number) {
		const accessPayload: AccessTokenPayload = { id: userId, sid };
		const refreshPayload: RefreshTokenPayload = { ...accessPayload, rid };

		return {
			accessToken: this.jwtService.sign(accessPayload),
			refreshToken: this.jwtService.sign(refreshPayload, { secret: this.refreshSecret, expiresIn: refreshExpiresIn }),
		};
	}
}
