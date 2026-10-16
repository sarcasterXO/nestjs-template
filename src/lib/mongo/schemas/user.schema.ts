import { Schema, SchemaTypes } from 'mongoose';

import { createSubSchema } from '../../util/Constants';
import { RoleNames } from '../../util/Permissions';
import { generateFlake } from '../../util/Snowflake';

import type { IUserZodSchema } from '../zod';

export const UserSchemaName = 'User';

const pushSubscriptionSchema = createSubSchema({
	endpoint: { type: SchemaTypes.String, required: true },
	keys: {
		type: createSubSchema({
			p256dh: { type: SchemaTypes.String, required: true },
			auth: { type: SchemaTypes.String, required: true },
		}),
		required: true,
	},
	expirationTime: { type: SchemaTypes.Date, required: false },
	userAgent: { type: SchemaTypes.String, required: false },
});

const sessionSchema = createSubSchema({
	id: { type: SchemaTypes.String, required: true },
	refreshHash: { type: SchemaTypes.String, required: true },
	userAgent: { type: SchemaTypes.String, required: false },
	createdAt: { type: SchemaTypes.Date, required: true },
	lastUsedAt: { type: SchemaTypes.Date, required: true },
});

export const UserSchema = new Schema<IUserZodSchema>(
	{
		id: { type: SchemaTypes.String, default: generateFlake, required: true, unique: true, immutable: true },
		name: { type: SchemaTypes.String, required: true },
		email: { type: SchemaTypes.String, required: true },
		password: { type: SchemaTypes.String, required: true, select: false },
		avatarUrl: { type: SchemaTypes.String, required: false },
		subscriptions: { type: [pushSubscriptionSchema], default: [] },
		lastLoginAt: { type: SchemaTypes.Date, required: false },
		sessions: { type: [sessionSchema], default: [], select: false },
		deleted: { type: SchemaTypes.Boolean, default: false },
		superAdmin: { type: SchemaTypes.Boolean, default: false },
		role: { type: SchemaTypes.String, enum: RoleNames, default: 'User', required: true },
		status: {
			type: SchemaTypes.String,
			enum: ['Requested', 'Accepted', 'Rejected', 'Deactivated'],
			default: 'Requested',
			required: true,
		},
	},
	{ timestamps: true, versionKey: false },
);

UserSchema.index({ email: 1 }, { unique: true });
