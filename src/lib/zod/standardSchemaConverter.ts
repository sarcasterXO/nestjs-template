import { toJSONSchema, z } from 'zod';

import type { StandardSchemaConverter } from '@nestjs/swagger';

/**
 * Converts zod schemas for `@nestjs/swagger`'s native standard-schema support.
 *
 * - `unrepresentable: 'any'` keeps `z.date()` (used by the generated mongo DTOs) from throwing.
 * - Schemas named with `.meta({ id })` become components. Request (input) variants get an `Input`
 *   suffix so they don't overwrite the response variant, which differs wherever `.default()` is used.
 */
export const standardSchemaConverter: StandardSchemaConverter = (schema, { schemaType }) => {
	if (!(schema instanceof z.ZodType)) return undefined;

	const suffix = schemaType === 'input' ? 'Input' : '';
	const json = JSON.stringify(
		toJSONSchema(schema, { target: 'openapi-3.0', io: schemaType, unrepresentable: 'any' }),
	).replaceAll(/"#\/(?:definitions|\$defs)\/(?<name>[^"]+)"/g, `"#/components/schemas/$<name>${suffix}"`);

	const { definitions = {}, ...root } = JSON.parse(json) as { definitions?: Record<string, unknown> };
	const components = Object.fromEntries(Object.entries(definitions).map(([name, value]) => [name + suffix, value]));

	return { schema: root, components };
};
