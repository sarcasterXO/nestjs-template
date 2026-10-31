import process from 'node:process';

import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

import { SESSION_TTL_MS } from '../src/lib/guard/auth.guard';
import { MongoAuditLogService, MongoUserService } from '../src/lib/mongo';
import { standardSchemaConverter, ZodValidationPipe } from '../src/lib/zod';

const credentials = { name: 'E2E User', email: 'e2e@example.com', password: 'correct-horse-1' };

describe('Auth flow (e2e)', () => {
	let mongo: MongoMemoryServer;
	let app: NestFastifyApplication;

	const request = async (method: 'DELETE' | 'GET' | 'PATCH' | 'POST', url: string, body?: object, token?: string) => {
		const response = await app.inject({
			method,
			url,
			payload: body,
			headers: token ? { authorization: `Bearer ${token}` } : {},
		});
		return { status: response.statusCode, body: response.json() };
	};

	// Shared by the tests below so they stay under the login route's rate limit.
	let accessToken: string;

	let successfulLogins = 0;
	const login = async (password = credentials.password) => {
		const response = await request('POST', '/auth/login', { email: credentials.email, password });
		if (response.status === 200) successfulLogins++;
		return response;
	};

	// A distinct `X-Real-IP` per call keeps these off the shared per-IP login limit.
	const loginFrom = async (ip: string, email: string, password: string, userAgent = 'e2e') =>
		app.inject({
			method: 'POST',
			url: '/auth/login',
			payload: { email, password },
			headers: { 'x-real-ip': ip, 'user-agent': userAgent },
		});

	beforeAll(async () => {
		mongo = await MongoMemoryServer.create();
		Object.assign(process.env, { DB_URI: mongo.getUri() });

		// Imported after DB_URI is set so ConfigModule picks it up instead of a value from .env.
		const { AppModule } = await import('../src/app.module');
		const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

		app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
		app.useGlobalPipes(new ZodValidationPipe());
		await app.init();
		await app.getHttpAdapter().getInstance().ready();
	});

	afterAll(async () => {
		await app.close();
		await mongo.stop();
	});

	test('serves liveness and readiness without a token', async () => {
		expect(await request('GET', '/health/live')).toMatchObject({ status: 200, body: { status: 'ok' } });

		const { status, body } = await request('GET', '/health');
		expect(status).toBe(200);
		expect(body.info).toMatchObject({ mongodb: { status: 'up' }, memory_heap: { status: 'up' } });
		expect(body.info).not.toHaveProperty('rabbitmq');
	});

	test('registers a pending account without echoing it back', async () => {
		const { status, body } = await request('POST', '/auth/register', credentials);

		expect(status).toBe(200);
		expect(Object.keys(body)).toEqual(['message']);
		expect(await app.get(MongoUserService).findOne({ email: credentials.email })).toMatchObject({
			status: 'Requested',
		});
	});

	test('answers a duplicate registration like a new one and rejects invalid ones', async () => {
		const first = await request('POST', '/auth/register', { ...credentials, email: 'fresh@example.com' });
		const duplicate = await request('POST', '/auth/register', { ...credentials, name: 'Impostor' });

		expect(duplicate).toEqual(first);
		expect(await app.get(MongoUserService).count({ email: credentials.email })).toBe(1);
		expect((await request('POST', '/auth/register', { ...credentials, email: 'not-an-email' })).status).toBe(422);
	});

	test('blocks login until an admin approves the account', async () => {
		expect((await login()).status).toBe(403);

		await app.get(MongoUserService).updateOne({ email: credentials.email }, { status: 'Accepted' });

		expect((await login('wrong-password')).status).toBe(401);
		expect((await login()).status).toBe(200);
	});

	test('guards routes with the access token', async () => {
		const { body } = await login();

		expect((await request('GET', '/users/me')).status).toBe(401);
		const me = await request('GET', '/users/me', undefined, body.accessToken);
		expect(me.status).toBe(200);
		expect(me.body.email).toBe(credentials.email);
	});

	test('checks route permissions against the user role', async () => {
		const { body } = await login();
		accessToken = body.accessToken;
		const userService = app.get(MongoUserService);

		const me = await request('GET', '/users/me', undefined, body.accessToken);
		expect(me.body).toMatchObject({ role: 'User', permissions: [] });
		expect((await request('GET', '/users', undefined, body.accessToken)).status).toBe(403);
		expect((await request('GET', '/audit-log', undefined, body.accessToken)).status).toBe(403);

		await userService.updateOne({ email: credentials.email }, { role: 'Admin' });
		expect((await request('GET', '/users', undefined, body.accessToken)).status).toBe(200);
		expect((await request('GET', '/audit-log', undefined, body.accessToken)).status).toBe(200);

		await userService.updateOne({ email: credentials.email }, { role: 'User', superAdmin: true });
		expect((await request('GET', '/roles', undefined, body.accessToken)).status).toBe(200);
		await userService.updateOne({ email: credentials.email }, { superAdmin: false });
	});

	test('strips fields the response DTO does not declare', async () => {
		const subscription = {
			endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
			keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
		};
		expect((await request('POST', '/push-notifications/subscribe', subscription, accessToken)).status).toBe(200);
		await app.get(MongoUserService).updateOne({ email: credentials.email }, { role: 'Admin' });

		const me = await request('GET', '/users/me', undefined, accessToken);
		const users = await request('GET', '/users', undefined, accessToken);
		for (const user of [me.body, ...users.body.data]) {
			for (const field of ['subscriptions', 'sessions', 'password', '_id']) expect(user).not.toHaveProperty(field);
		}

		await app.get(MongoUserService).updateOne({ email: credentials.email }, { role: 'User' });
	});

	test("rejects avatars that are not images or not the user's own uploads, and unknown push services", async () => {
		const updateAvatar = async (avatarUrl: object | string) =>
			(await request('PATCH', '/users/me', { avatarUrl }, accessToken)).status;

		expect(await updateAvatar('https://evil.example.com/avatar.png')).toBe(400);
		expect(await updateAvatar('http://evil.example.com/avatar.png')).toBe(422);
		expect(await updateAvatar({ buffer: 'PHN2Zz4=', name: 'avatar.svg' })).toBe(422);
		expect(await updateAvatar({ buffer: 'PGh0bWw+', name: 'avatar.png' })).toBe(400);

		const subscription = { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'p256dh-key', auth: 'auth-key' } };
		expect((await request('POST', '/push-notifications/subscribe', subscription, accessToken)).status).toBe(422);
	});

	test('only super admins can update or delete a super admin', async () => {
		const userService = app.get(MongoUserService);
		const owner = await userService.create({
			name: 'Owner',
			email: 'owner@example.com',
			password: 'not-a-real-hash',
			status: 'Accepted',
			superAdmin: true,
		});

		await userService.updateOne({ email: credentials.email }, { role: 'Admin' });
		expect((await request('PATCH', `/users/${owner.id}`, { status: 'Deactivated' }, accessToken)).status).toBe(403);
		expect((await request('DELETE', '/users', { userId: owner.id }, accessToken)).status).toBe(403);

		await userService.updateOne({ email: credentials.email }, { role: 'User', superAdmin: true });
		const updated = await request('PATCH', `/users/${owner.id}`, { name: 'Owner Renamed' }, accessToken);
		expect(updated.status).toBe(200);
		expect(updated.body).toMatchObject({ user: { name: 'Owner Renamed' }, message: 'User updated successfully' });

		await userService.updateOne({ email: credentials.email }, { superAdmin: false });
	});

	test('sets, validates and clears the phone number', async () => {
		const phone = { countryCode: '+1', number: '5550100123' };
		expect((await request('PATCH', '/users/me', { phone }, accessToken)).status).toBe(200);
		expect((await request('PATCH', '/users/me', { name: credentials.name }, accessToken)).status).toBe(200);
		expect((await request('GET', '/users/me', undefined, accessToken)).body.phone).toEqual(phone);

		for (const invalid of [
			{ countryCode: '1', number: '5550100123' },
			{ countryCode: '+1', number: '55a0100123' },
			{ countryCode: '+1', number: '555010' },
			{ countryCode: '+1', number: '555010012345678' },
		]) {
			expect((await request('PATCH', '/users/me', { phone: invalid }, accessToken)).status).toBe(422);
		}

		expect((await request('PATCH', '/users/me', { phone: null, avatarUrl: null }, accessToken)).status).toBe(200);
		expect((await request('GET', '/users/me', undefined, accessToken)).body).not.toHaveProperty('phone');
		const stored = await app.get(MongoUserService).model.findOne({ email: credentials.email }).lean();
		expect(stored).not.toHaveProperty('phone');
		expect(stored).not.toHaveProperty('avatarUrl');
	});

	test('nobody, not even a super admin, changes their own role', async () => {
		const userService = app.get(MongoUserService);
		await userService.updateOne({ email: credentials.email }, { superAdmin: true });
		const { body: me } = await request('GET', '/users/me', undefined, accessToken);

		expect((await request('PATCH', '/users/me', { role: 'Admin' }, accessToken)).status).toBe(200);
		expect((await request('PATCH', `/users/${me.id}`, { role: 'Admin' }, accessToken)).status).toBe(400);
		expect(await userService.findOne({ email: credentials.email })).toMatchObject({ role: 'User' });

		await userService.updateOne({ email: credentials.email }, { superAdmin: false });
	});

	test('changing my email needs the current password and a free address', async () => {
		const changeEmail = async (email: string, currentPassword?: string) =>
			(await request('PATCH', '/users/me', { email, currentPassword }, accessToken)).status;
		const newEmail = 'renamed@example.com';

		expect(await changeEmail(newEmail)).toBe(422);
		expect(await changeEmail(newEmail, 'wrong-password')).toBe(400);
		expect(await changeEmail('owner@example.com', credentials.password)).toBe(400);
		expect(await changeEmail(newEmail.toUpperCase(), credentials.password)).toBe(200);
		expect((await request('GET', '/users/me', undefined, accessToken)).body.email).toBe(newEmail);

		expect(await changeEmail(credentials.email, credentials.password)).toBe(200);
	});

	test('keeps push subscriptions from two devices with the same user agent, out of default reads', async () => {
		const userService = app.get(MongoUserService);
		const endpoints = ['https://fcm.googleapis.com/fcm/send/laptop-1', 'https://fcm.googleapis.com/fcm/send/laptop-2'];
		for (const endpoint of endpoints) {
			const response = await app.inject({
				method: 'POST',
				url: '/push-notifications/subscribe',
				payload: { endpoint, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } },
				headers: { authorization: `Bearer ${accessToken}`, 'user-agent': 'Same Browser/1.0' },
			});
			expect(response.statusCode).toBe(200);
		}

		const stored = await userService.findOne({ email: credentials.email }, ['subscriptions']);
		expect(stored?.subscriptions.map((sub) => sub.endpoint)).toEqual(expect.arrayContaining(endpoints));
		expect(await userService.findOne({ email: credentials.email })).not.toHaveProperty('subscriptions');
	});

	test('matches the user list filter on the start of the name or email', async () => {
		const userService = app.get(MongoUserService);
		await userService.updateOne({ email: credentials.email }, { role: 'Admin' });

		for (const [name, matches] of [
			['e2e u', true],
			['E2E@', true],
			['user', false],
		] as const) {
			const { body } = await request('GET', `/users?name=${encodeURIComponent(name)}`, undefined, accessToken);
			expect(body.data.some((user: { email: string }) => user.email === credentials.email)).toBe(matches);
		}

		await userService.updateOne({ email: credentials.email }, { role: 'User' });
	});

	test('login prunes expired sessions and keeps the three most recently used', async () => {
		const userService = app.get(MongoUserService);
		const email = 'sessions@example.com';
		const now = new Date();
		const expired = {
			id: 'expired',
			refreshHash: 'unused',
			createdAt: new Date(now.getTime() - SESSION_TTL_MS - 1_000),
			lastUsedAt: now,
		};
		await userService.create({
			name: 'Sessions',
			email,
			password: await argon2.hash(credentials.password),
			status: 'Accepted',
			sessions: [expired],
		});

		for (const index of [1, 2, 3, 4]) {
			expect((await loginFrom(`10.0.1.${index}`, email, credentials.password, '$sessions')).statusCode).toBe(200);
			successfulLogins++;
		}

		const stored = await userService.findOne({ email }, ['+sessions']);
		expect(stored?.sessions).toHaveLength(3);
		expect(stored?.sessions.map((session) => session.id)).not.toContain('expired');
		// Sent as a literal, not read as a `$field` path by the pipeline update.
		expect(stored?.sessions.every((session) => session.userAgent === '$sessions')).toBe(true);
	});

	test('limits login attempts per email across IPs', async () => {
		const email = 'target@example.com';
		for (let index = 0; index < 10; index++) {
			expect((await loginFrom(`10.0.2.${index}`, email, 'wrong-password')).statusCode).toBe(401);
		}
		expect((await loginFrom('10.0.2.99', email.toUpperCase(), 'wrong-password')).statusCode).toBe(429);
	});

	test('rotates refresh tokens and revokes the session on replay', async () => {
		const { body: session } = await login();

		const refreshed = await request('POST', '/auth/refresh', { refreshToken: session.refreshToken });
		expect(refreshed.status).toBe(200);
		expect(refreshed.body.refreshToken).not.toBe(session.refreshToken);

		expect((await request('POST', '/auth/refresh', { refreshToken: session.refreshToken })).status).toBe(401);
		expect((await request('GET', '/users/me', undefined, refreshed.body.accessToken)).status).toBe(401);
	});

	test('logout ends the session', async () => {
		const { body } = await login();

		expect((await request('POST', '/auth/logout', undefined, body.accessToken)).status).toBe(200);
		expect((await request('GET', '/users/me', undefined, body.accessToken)).status).toBe(401);
	});

	test('changing the password logs out every session', async () => {
		const { body } = await login();
		const newPassword = 'correct-horse-2';

		const changed = await request(
			'PATCH',
			'/auth/password',
			{ currentPassword: credentials.password, newPassword },
			body.accessToken,
		);
		expect(changed.status).toBe(200);
		expect((await request('GET', '/users/me', undefined, body.accessToken)).status).toBe(401);
		expect((await login()).status).toBe(401);
		expect((await login(newPassword)).status).toBe(200);
	});

	test('builds the Swagger document from the Zod schemas', () => {
		const document = SwaggerModule.createDocument(app, new DocumentBuilder().build(), { standardSchemaConverter });

		expect(document.components?.schemas).toHaveProperty('RegisterDtoInput');
		expect(document.components?.schemas).toHaveProperty('APIAuthUserDto');
		expect(document.paths['/users']?.get?.parameters?.map((param) => 'name' in param && param.name)).toEqual(
			expect.arrayContaining(['page', 'limit', 'sort', 'name']),
		);
	});

	// Audit entries are written fire-and-forget, so this also drains them before the app closes.
	test('writes an audit entry for every account action', async () => {
		const auditLogService = app.get(MongoAuditLogService);

		await vi.waitFor(async () => {
			// Two new registrations; the duplicate one writes nothing.
			expect(await auditLogService.count({ action: 'user created' })).toBe(2);
			expect(await auditLogService.count({ action: 'user login' })).toBe(successfulLogins);
			expect(await auditLogService.count({ action: 'user logout' })).toBe(1);
			// Password change, the super admin's rename of the owner account, three phone updates, the ignored self
			// role change, and two email changes.
			expect(await auditLogService.count({ action: 'user updated' })).toBe(8);
		});
	});
});
