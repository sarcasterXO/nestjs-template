import { Schema, SchemaTypes } from 'mongoose';

import { createSubSchema } from '../../util/Constants';
import { generateFlake } from '../../util/Snowflake';

import type { IAuditLogZodSchema } from '../zod';

export const AuditLogSchemaName = 'AuditLog';

const auditLogChangeSchema = createSubSchema({
	field: { type: SchemaTypes.String, required: true },
	from: { type: SchemaTypes.Mixed, required: false },
	to: { type: SchemaTypes.Mixed, required: false },
});

export const AuditLogSchema = new Schema<IAuditLogZodSchema>(
	{
		id: { type: SchemaTypes.String, default: generateFlake, required: true, unique: true, immutable: true },
		message: { type: String, required: true },
		user: {
			type: createSubSchema({
				id: { type: SchemaTypes.String, required: true },
				name: { type: SchemaTypes.String, required: false },
			}),
			required: true,
		},
		action: {
			type: SchemaTypes.String,
			required: true,
			index: true,
			enum: ['user created', 'user updated', 'user deleted', 'user login', 'user logout'],
		},
		documentId: { type: String, required: false, index: true },
		changes: { type: [auditLogChangeSchema], required: false, default: undefined },
	},
	{
		timestamps: true,
		versionKey: false,
	},
);

AuditLogSchema.index({ createdAt: -1, id: -1 });
AuditLogSchema.index({ 'user.id': 1, createdAt: -1, id: -1 });
// For the `search` prefix match.
AuditLogSchema.index({ message: 1 });
