import process from 'node:process';

import { Schema, SchemaTypes, type SchemaDefinition, type SchemaDefinitionType, type SchemaOptions } from 'mongoose';

export const createSubSchema = <T>(
	definition: SchemaDefinition<SchemaDefinitionType<T>, T>,
	options: SchemaOptions<T> = {},
) =>
	new Schema(definition, {
		// oxlint-disable-next-line mahir-restricted-syntax/no-restricted-syntax
		_id: false,
		versionKey: false,
		...options,
	});

export const mongoAttachmentSchema = createSubSchema({
	name: { type: SchemaTypes.String, required: true },
	url: { type: SchemaTypes.String, required: true },
});

export const DB_CONNECTION_NAME = process.env.NODE_ENV === 'production' ? 'app-api' : 'app-api-dev';
