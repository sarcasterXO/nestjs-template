/* oxlint-disable promise/prefer-await-to-then */
/* oxlint-disable no-console */
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { readFile, writeFile, access, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import process, { argv } from 'node:process';

import { Glob } from 'bun';

const STORE_FILE = join(import.meta.dirname, '../.srchash');
const SRC_DIR = join(import.meta.dirname, '../');

async function calculateHash(): Promise<string> {
	const startTime = performance.now();
	const glob = new Glob('./mongo/schemas/*.schema.ts');
	const files: string[] = [];

	for await (const file of glob.scan(SRC_DIR)) files.push(join(SRC_DIR, file));
	console.log(`Found ${files.length} files for hashing.`);
	const contents = await Promise.all(files.map((fa) => readFile(fa)));
	const content = contents.join('');
	const hash = createHash('sha256').update(content).digest('hex');

	const endTime = performance.now();
	console.log(`Hash calculation took ${(endTime - startTime).toFixed(2)}ms`);
	return hash;
}

async function calculateSize(): Promise<string> {
	const startTime = performance.now();
	const glob = new Glob('./mongo/schemas/*.schema.ts');

	let totalSize = 0;
	const promises: Promise<number>[] = [];

	for await (const file of glob.scan(SRC_DIR)) {
		promises.push(stat(join(SRC_DIR, file)).then((stats) => stats.size));

		if (promises.length >= 50) {
			const sizes = await Promise.all(promises);
			totalSize += sizes.reduce((sum, size) => sum + size, 0);
			promises.length = 0;
		}
	}
	console.log(`Found ${totalSize} bytes in schema files.`);

	if (promises.length > 0) {
		const sizes = await Promise.all(promises);
		totalSize += sizes.reduce((sum, size) => sum + size, 0);
	}

	const endTime = performance.now();
	console.log(`Size calculation took ${(endTime - startTime).toFixed(2)}ms`);
	return totalSize.toString();
}

async function getPreviousValue(): Promise<string> {
	try {
		await access(STORE_FILE, constants.F_OK);
		return await readFile(STORE_FILE, 'utf8');
	} catch {
		return '';
	}
}

async function saveNewValue(value: string) {
	await writeFile(STORE_FILE, value);
}

async function runCommands() {
	const commands = ['bun ./src/lib/scripts/schemaToZod.ts --lint'];

	for (const cmd of commands) {
		try {
			console.log(`Running: ${cmd}`);
			// oxlint-disable-next-line n/no-sync
			execSync(cmd, { stdio: 'inherit' });
		} catch {
			console.error(`Failed to run command: ${cmd}`);
			process.exit(1);
		}
	}
}

const scriptStartTime = performance.now();
const mode = argv.includes('--mode=size') ? 'size' : 'hash';
const force = argv.includes('--force');

if (force) {
	console.log('Force flag detected, running sync...');
	await runCommands();
	const currentValue = mode === 'size' ? await calculateSize() : await calculateHash();
	await saveNewValue(currentValue);
} else {
	const [currentValue, previousValue] = await Promise.all([
		(mode === 'size' ? calculateSize : calculateHash)(),
		getPreviousValue(),
	]);

	if (currentValue === previousValue) console.log(`No ${mode} changes detected in source files, skipping sync`);
	else {
		console.log(`Source files ${mode} changed, running sync...`);
		await runCommands();
		await saveNewValue(currentValue);
	}
}

const scriptEndTime = performance.now();
console.log(`Total script execution time: ${(scriptEndTime - scriptStartTime).toFixed(2)}ms`);
