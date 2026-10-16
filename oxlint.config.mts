import common from '@imranbarbhuiya/oxc-config/common';
import module from '@imranbarbhuiya/oxc-config/module';
import nest from '@imranbarbhuiya/oxc-config/nest';
import node from '@imranbarbhuiya/oxc-config/node';
import typescript from '@imranbarbhuiya/oxc-config/typescript';
import { defineConfig } from 'oxlint';

export default defineConfig({
	extends: [common, node, module, typescript, nest],
	ignorePatterns: ['.github/**', '.cache', '**/dist/**', '**/coverage/**', '**/*.hbs', '**/*.yaml'],
	env: {
		node: true,
	},
	options: {
		typeAware: true,
	},
	rules: {
		'unicorn/no-array-method-this-argument': 0,
		'no-console': ['error', { allow: ['error', 'info', 'warn'] }],
		curly: [2, 'multi-line'],
		'mahir-restricted-syntax/no-restricted-syntax': [
			'error',
			{ selector: "Property[key.name='_id']", message: 'Do not use _id as a property in objects.' },
			{ selector: "MemberExpression[property.name='_id']", message: 'Do not access ._id' },
		],
	},
});
