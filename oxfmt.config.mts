import config from '@imranbarbhuiya/oxc-config/oxfmt';
import { defineConfig } from 'oxfmt';

export default defineConfig({
	...config,
	ignorePatterns: ['.cache', '**/dist/**', '**/coverage/**', '**/*.hbs', '**/*.yaml', 'bun.lock'],
});
