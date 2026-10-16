import { fileURLToPath } from 'node:url';

import swc from 'unplugin-swc';
import { defineConfig, type ViteUserConfig } from 'vitest/config';

const src = (path: string) => fileURLToPath(new URL(`src/${path}`, import.meta.url));

export const aliases = [
	{ find: /^#app\/mongoose$/, replacement: src('lib/mongo/index.ts') },
	{ find: /^#app\/mongoose\/(.*)$/, replacement: src('lib/mongo/$1') },
	{ find: /^#zod$/, replacement: src('lib/zod/index.ts') },
];

export default defineConfig({
	test: {
		globals: true,
		coverage: {
			reporter: ['text', 'lcov', 'clover'],
			provider: 'v8',
		},
	},
	resolve: { alias: aliases },
	plugins: [
		swc.vite({
			module: { type: 'es6' },
		}) as NonNullable<ViteUserConfig['plugins']>[number],
	],
});
