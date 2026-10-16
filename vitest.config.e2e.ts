import swc from 'unplugin-swc';
import { defineConfig, type ViteUserConfig } from 'vitest/config';
import webPush from 'web-push';

import { aliases } from './vitest.config';

const vapid = webPush.generateVAPIDKeys();

export default defineConfig({
	test: {
		include: ['**/*.e2e-test.ts'],
		globals: true,
		// Real env vars win over .env, so local credentials never leak into the run. DB_URI is set by the test
		// itself from an in-memory MongoDB.
		env: {
			NODE_ENV: 'test',
			JWT_ACCESS_SECRET: 'e2e-access-secret',
			JWT_REFRESH_SECRET: 'e2e-refresh-secret',
			VAPID_PUBLIC_KEY: vapid.publicKey,
			VAPID_PRIVATE_KEY: vapid.privateKey,
			VAPID_SUBJECT: 'mailto:e2e@example.com',
			SMTP_HOST: '',
			RMQ_URI: '',
		},
		hookTimeout: 120_000,
		testTimeout: 30_000,
	},
	resolve: { alias: aliases },
	plugins: [swc.vite() as NonNullable<ViteUserConfig['plugins']>[number]],
});
