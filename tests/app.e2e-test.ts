import process from 'node:process';

import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

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

	test('registers a pending account without exposing the password', async () => {
		const { status, body } = await request('POST', '/auth/register', credentials);

		expect(status).toBe(200);
		expect(body).toMatchObject({ email: credentials.email, status: 'Requested' });
		expect(body).not.toHaveProperty('password');
	});

	test('rejects duplicate and invalid registrations', async () => {
		expect((await request('POST', '/auth/register', credentials)).status).toBe(400);
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
		const subscription = { endpoint: 'https://push.example.com/abc', keys: { p256dh: 'p256dh-key', auth: 'auth-key' } };
		expect((await request('POST', '/push-notifications/subscribe', subscription, accessToken)).status).toBe(200);
		await app.get(MongoUserService).updateOne({ email: credentials.email }, { role: 'Admin' });

		const me = await request('GET', '/users/me', undefined, accessToken);
		const users = await request('GET', '/users', undefined, accessToken);
		for (const user of [me.body, ...users.body.data]) {
			for (const field of ['subscriptions', 'sessions', 'password', '_id']) expect(user).not.toHaveProperty(field);
		}

		await app.get(MongoUserService).updateOne({ email: credentials.email }, { role: 'User' });
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
			expect(await auditLogService.count({ action: 'user created' })).toBe(1);
			expect(await auditLogService.count({ action: 'user login' })).toBe(successfulLogins);
			expect(await auditLogService.count({ action: 'user logout' })).toBe(1);
			// Password change + the super admin's rename of the owner account.
			expect(await auditLogService.count({ action: 'user updated' })).toBe(2);
		});
	});
});
