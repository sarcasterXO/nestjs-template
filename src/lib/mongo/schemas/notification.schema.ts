import { Schema, SchemaTypes } from 'mongoose';

import { generateFlake } from '../../util/Snowflake';

import type { INotificationZodSchema } from '../zod';

export const NotificationSchemaName = 'Notification';

export const NotificationSchema = new Schema<INotificationZodSchema>(
	{
		id: { type: SchemaTypes.String, default: generateFlake, required: true, unique: true, immutable: true },
		userId: { type: SchemaTypes.String, required: true },
		type: { type: SchemaTypes.String, required: false },
		message: { type: SchemaTypes.String, required: true },
		title: { type: SchemaTypes.String, required: true },
		read: { type: SchemaTypes.Boolean, required: true, default: false },
	},
	{ timestamps: true, versionKey: false },
);

NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export type INotificationUserId = INotificationZodSchema['userId'];
export type INotificationMessage = INotificationZodSchema['message'];
export type INotificationRead = INotificationZodSchema['read'];
