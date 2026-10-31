import process from 'node:process';

import { S3Client } from '@aws-sdk/client-s3';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { MongoMemoryServer } from 'mongodb-memory-server';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import { MongoUserService } from '../src/lib/mongo';
import { ZodValidationPipe } from '../src/lib/zod';
import { UserService } from '../src/user/user.service';

const credentials = { name: 'S3 User', email: 's3@example.com', password: 'correct-horse-1' };
const bucket = `https://${process.env.S3_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com`;

describe('S3 key namespace (e2e)', () => {
	let mongo: MongoMemoryServer;
	let app: NestFastifyApplication;
	let users: MongoUserService;
	let token: string;
	let userId: string;
	let avatar: { buffer: string; name: string };
	const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);

	const inputsOf = (command: string) =>
		send.mock.calls.flatMap(([sent]) =>
			sent.constructor.name === command ? [sent.input as Record<string, unknown>] : [],
		);
	const deletedKeys = () =>
		inputsOf('DeleteObjectsCommand').flatMap((input) =>
			(input.Delete as { Objects: { Key: string }[] }).Objects.map(({ Key }) => Key),
		);

	const updateAvatar = async (avatarUrl: object | string | null) => {
		const response = await app.inject({
			method: 'PATCH',
			url: '/users/me',
			payload: { avatarUrl },
			headers: { authorization: `Bearer ${token}` },
		});
		return { status: response.statusCode, avatarUrl: response.json().avatarUrl as string | null };
	};

	beforeAll(async () => {
		mongo = await MongoMemoryServer.create();
		Object.assign(process.env, { DB_URI: mongo.getUri() });

		const { AppModule } = await import('../src/app.module');
		const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
		app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
		app.useGlobalPipes(new ZodValidationPipe());
		await app.init();
		await app.getHttpAdapter().getInstance().ready();

		users = app.get(MongoUserService);
		await app.inject({ method: 'POST', url: '/auth/register', payload: credentials });
		await users.updateOne({ email: credentials.email }, { status: 'Accepted' });
		const login = await app.inject({ method: 'POST', url: '/auth/login', payload: credentials });
		token = login.json().accessToken;
		userId = login.json().id;

		const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#000' } })
			.png()
			.toBuffer();
		avatar = { buffer: png.toString('base64'), name: 'Me.png' };
	});

	beforeEach(() => {
		send.mockClear();
	});

	afterAll(async () => {
		send.mockRestore();
		await app.close();
		await mongo.stop();
	});

	test('uploads under app/<env>/ and deletes the replaced upload', async () => {
		const first = await updateAvatar(avatar);
		expect(first.status).toBe(200);
		expect(inputsOf('PutObjectCommand')).toMatchObject([{ Key: `app/development/users/${userId}/me.webp` }]);
		expect(first.avatarUrl).toMatch(new RegExp(`^${bucket}/app/development/users/${userId}/me\\.webp\\?v=\\d+$`));

		expect((await updateAvatar(first.avatarUrl)).status).toBe(200);
		expect(deletedKeys()).toEqual([]);

		expect((await updateAvatar(null)).status).toBe(200);
		expect(deletedKeys()).toEqual([`app/development/users/${userId}/me.webp`]);
	});

	test('rejects an avatar URL outside the user prefix', async () => {
		expect((await updateAvatar(`${bucket}/app/development/users/someone-else/a.webp`)).status).toBe(400);
		expect(inputsOf('PutObjectCommand')).toEqual([]);
	});

	test.each([
		['another environment', 'app/production/users/{id}/a.webp'],
		['another user', 'app/development/users/someone-else/a.webp'],
		['nobody', 'app/development/users/a.webp'],
	])('never deletes a stored avatar owned by %s', async (_, key) => {
		await users.updateOne({ id: userId }, { avatarUrl: `${bucket}/${key.replace('{id}', userId)}` });

		expect((await updateAvatar(null)).status).toBe(200);
		expect(deletedKeys()).toEqual([]);
	});

	test('deleting a user clears their prefix', async () => {
		const other = await users.create({
			name: 'Other',
			email: 'other@example.com',
			password: 'not-a-real-hash',
			status: 'Accepted',
		});

		await app.get(UserService).deleteUser(other, { id: userId, name: credentials.name });
		expect(inputsOf('ListObjectsV2Command')).toMatchObject([{ Prefix: `app/development/users/${other.id}/` }]);
	});
});
