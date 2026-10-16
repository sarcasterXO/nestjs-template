import { execSync } from 'node:child_process';
import { opendir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import util from 'node:util';

import { jsonSchemaToZod, type JsonSchemaObject } from 'json-schema-to-zod';
import mongoose from 'mongoose';
// @ts-expect-error -- mongoose-schema-jsonschema does not have types
import mongooseFn from 'mongoose-schema-jsonschema';

mongooseFn(mongoose);

const flags = process.argv.slice(2);
let runLint = false;
if (flags.includes('--lint')) runLint = true;

async function* findFilesRecursively(path: string): AsyncGenerator<string> {
	try {
		const dir = await opendir(path);
		for await (const item of dir) {
			if (item.isFile()) yield join(dir.path, item.name);
			else if (item.isDirectory()) yield* findFilesRecursively(join(dir.path, item.name));
		}
	} catch (error: any) {
		if (error.code !== 'ENOENT') console.error(error);
	}
}

function makeArraysOptional(schema: mongoose.Schema, json: JsonSchemaObject) {
	for (const [path, schemaType] of Object.entries(schema.paths)) {
		const segments = path.split('.');
		const key = segments.pop()!;
		let container = json;
		for (const segment of segments) container = container.properties?.[segment] as JsonSchemaObject;
		const property = container.properties?.[key];
		if (typeof property !== 'object') continue;

		if (schemaType instanceof mongoose.Schema.Types.Subdocument) makeArraysOptional(schemaType.schema, property);
		if (
			schemaType instanceof mongoose.Schema.Types.DocumentArray &&
			typeof property.items === 'object' &&
			!Array.isArray(property.items)
		) {
			makeArraysOptional(schemaType.schema, property.items);
		}

		if (schemaType.instance !== 'Array') continue;
		const { required, default: defaultValue } = schemaType.options;
		if (defaultValue !== undefined || required) continue;
		delete property.default;
		if (Array.isArray(container.required)) container.required = container.required.filter((name) => name !== key);
	}
}

let exportMap = '';
const startTime = performance.now();
let processedFiles = 0;
let totalSchemas = 0;

console.info('🚀 Starting Schema Conversion Process\n');
console.info('📁 Scanning directories for schema files...\n');

for await (const file of findFilesRecursively('./src/lib/mongo/schemas')) {
	const fileName = file.split('/').pop()!;

	// Skip barrel/index files – only process individual *.schema.ts files
	if (!fileName.endsWith('.schema.ts')) {
		continue;
	}

	processedFiles++;
	console.info(`\n📄 Processing: ${fileName}`);
	console.info('├── 🔍 Loading schema...');

	const schemaImport = (await import(resolve(file))) as {
		[key: string]: mongoose.Schema & { jsonSchema: () => JsonSchemaObject };
	};

	const schemaKeys = Object.keys(schemaImport).filter((key) => key.endsWith('Schema'));
	if (!schemaKeys.length) {
		console.info('    └── No schemas found in this file, skipping...');
		continue;
	}

	console.info(`├── ✨ Found schemas: ${schemaKeys.join(', ')}`);
	const sanitizedPath = file.replaceAll('\\', '/');
	const pathToWrite = sanitizedPath.replace('schemas', 'zod').replace('.schema.', '.dto.');
	console.info(`├── 💾 Writing files:`);
	console.info(`│   ├── 📝 ${pathToWrite}`);

	let dtoFileContent = `
    /* THIS FILE WAS GENERATED AUTOMATICALLY BY the sync script. */
    /* DO NOT MODIFY IT BECAUSE IT COULD BE REWRITTEN AT ANY TIME. */
    /* TO REGENERATE RUN: \`bun run sync\` */

    import { z, type infer as TypeOf } from 'zod';
    `;

	await Promise.all(
		schemaKeys.map(async (schemaName) => {
			const zodSchemaName = schemaName.replace('Schema', 'ZodSchema');
			const Schema = schemaImport[schemaName];

			const customZodTypes = schemaImport[`custom${schemaName}ZodTypes`] as unknown as
				| Record<string, string>
				| undefined;

			console.info(`│       - Converting ${schemaName} to JSON schema...`);
			const jsonSchemaObject = Schema.jsonSchema();
			makeArraysOptional(Schema, jsonSchemaObject);

			console.info(`│       - Generating zod schema ${zodSchemaName}...`);

			const code = jsonSchemaToZod(jsonSchemaObject, {
				module: 'none',
				name: zodSchemaName,
				depth: 15,
				parserOverride: (schema, refs) => {
					if (schema._zodType) {
						if (!schema._zodType.startsWith('z.')) {
							const path = refs.path.join('.').replaceAll('properties.', '');
							console.error(
								`Schema ${util.styleText('blue', schemaName)} has an invalid \`${util.styleText('italic', '_zodType')}\` at path ${util.styleText('blue', path)}. Please ensure it starts with ${util.styleText('green', 'z.')}`,
							);
							process.exit(1);
						}
						return `${schema._zodType}${schema.nullable ? '.nullable()' : ''}`;
					}
					// TODO: remove and use `_zodType` in schemas
					if (customZodTypes) {
						const fieldName = refs.path[refs.path.length - 1];
						const custom = customZodTypes[fieldName];
						if (custom) return custom;
					}
				},
			})
				.replaceAll(
					'z.string().datetime({ offset: true })',
					'z.union([z.date(), z.iso.datetime({ offset: true })]).pipe(z.coerce.date()).meta({ type: "string", format: "date-time" })',
				)
				.replaceAll('.nullable().optional()', '.nullish()')
				.replaceAll(
					'"coordinates": z.array(z.number())',
					'"coordinates": z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])',
				)
				.replaceAll(
					'z.tuple([z.number(), z.number()])',
					'z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])',
				);

			const partialCode = `export const Partial${zodSchemaName} = ${zodSchemaName}.partial()`;

			dtoFileContent += `
            export ${code}
            ${partialCode}

            export type I${zodSchemaName} = TypeOf<typeof ${zodSchemaName}>;
			export type I${zodSchemaName}Input = Omit<z.input<typeof ${zodSchemaName}>, 'createdAt' | 'updatedAt'> &
				Partial<Pick<z.input<typeof ${zodSchemaName}>, Extract<'createdAt' | 'updatedAt', keyof z.input<typeof ${zodSchemaName}>>>>;
            export type IPartial${zodSchemaName} = TypeOf<typeof Partial${zodSchemaName}>;
            `;

			totalSchemas++;
			exportMap += `export { ${zodSchemaName}, type I${zodSchemaName}, type I${zodSchemaName}Input, Partial${zodSchemaName}, type IPartial${zodSchemaName} } from './${pathToWrite
				.split('/')
				.pop()!
				.replace('.ts', '.js')}';\n`;
		}),
	);

	await writeFile(pathToWrite, dtoFileContent);
}

console.info('\n📦 Finalizing...');
console.info('├── 📝 Writing index file...');
const sortedExportMap = exportMap
	.split('\n')
	.filter(Boolean)
	.sort((a, b) => a.localeCompare(b))
	.join('\n');
await writeFile('./src/lib/mongo/zod/index.ts', sortedExportMap + '\n');

console.info('├── 🧪 Running oxlint...');
if (runLint) execSync(`bunx oxlint --fix ./src/lib/mongo/zod`);
else console.info('│   └── Skipping oxlint...');
console.info('└── 🎨 Running oxfmt...');
execSync(`bunx oxfmt ./src/lib/mongo/zod`);

const duration = ((performance.now() - startTime) / 1_000).toFixed(2);
console.info(`\n✨ Conversion Complete! (${duration}s)`);
console.info(`📊 Summary:`);
console.info(`   • Files processed: ${processedFiles}`);
console.info(`   • Schemas converted: ${totalSchemas}`);
