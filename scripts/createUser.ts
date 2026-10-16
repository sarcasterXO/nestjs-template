/* oxlint-disable no-console, no-alert */
import process from 'node:process';
import { parseArgs } from 'node:util';

import * as argon2 from 'argon2';
import mongoose from 'mongoose';
import { z } from 'zod';

import { emailSchema, passwordSchema } from '../src/auth/auth.request.dto';
import { UserSchema, UserSchemaName } from '../src/lib/mongo/schemas/user.schema';
import { DB_CONNECTION_NAME } from '../src/lib/util/Constants';
import { RoleNames } from '../src/lib/util/Permissions';

const USAGE = `Usage: bun scripts/createUser.ts --name <name> --email <email> [--password <password>] [--role ${RoleNames.join('|')}] [--super-admin]
Omit --password to be prompted for it, which keeps it out of your shell history.`;

function fail(message: string): never {
	console.error(`${message}\n\n${USAGE}`);
	process.exit(1);
}

let values;
try {
	({ values } = parseArgs({
		options: {
			name: { type: 'string' },
			email: { type: 'string' },
			password: { type: 'string' },
			role: { type: 'string', default: 'User' },
			'super-admin': { type: 'boolean', default: false },
		},
	}));
} catch (error) {
	fail(error instanceof Error ? error.message : String(error));
}

const parsed = z
	.object({
		name: z.string().min(1),
		email: emailSchema,
		password: passwordSchema,
		role: z.enum(RoleNames),
		superAdmin: z.boolean(),
	})
	.safeParse({
		name: values.name,
		email: values.email,
		password: values.password ?? prompt('Password:') ?? undefined,
		role: values.role,
		superAdmin: values['super-admin'],
	});
if (!parsed.success) fail(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n'));

const { name, email, password, role, superAdmin } = parsed.data;
if (!process.env.DB_URI) fail('DB_URI is not set. Run this from the project root so Bun loads .env.');

const connection = await mongoose.createConnection(process.env.DB_URI, { dbName: DB_CONNECTION_NAME }).asPromise();
try {
	const User = connection.model(UserSchemaName, UserSchema);
	if (await User.exists({ email })) {
		console.error(`A user with email ${email} already exists.`);
		process.exitCode = 1;
	} else {
		const user = await User.create({
			name,
			email,
			password: await argon2.hash(password),
			role,
			superAdmin,
			status: 'Accepted',
		});
		console.log(`Created ${role}${superAdmin ? ' (super admin)' : ''} "${name}" <${email}> with ID ${user.id}`);
	}
} finally {
	await connection.close();
}
