/* THIS FILE WAS GENERATED AUTOMATICALLY BY the sync script. */
/* DO NOT MODIFY IT BECAUSE IT COULD BE REWRITTEN AT ANY TIME. */
/* TO REGENERATE RUN: `bun run sync` */

import { z, type infer as TypeOf } from 'zod';

export const UserZodSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
	password: z.string(),
	avatarUrl: z.string().nullish(),
	subscriptions: z
		.array(
			z.object({
				endpoint: z.string(),
				keys: z.object({ p256dh: z.string(), auth: z.string() }),
				expirationTime: z
					.union([z.date(), z.iso.datetime({ offset: true })])
					.pipe(z.coerce.date())
					.meta({ type: 'string', format: 'date-time' })
					.nullish(),
				userAgent: z.string().nullish(),
			}),
		)
		.default([]),
	lastLoginAt: z
		.union([z.date(), z.iso.datetime({ offset: true })])
		.pipe(z.coerce.date())
		.meta({ type: 'string', format: 'date-time' })
		.nullish(),
	sessions: z
		.array(
			z.object({
				id: z.string(),
				refreshHash: z.string(),
				userAgent: z.string().nullish(),
				createdAt: z
					.union([z.date(), z.iso.datetime({ offset: true })])
					.pipe(z.coerce.date())
					.meta({ type: 'string', format: 'date-time' }),
				lastUsedAt: z
					.union([z.date(), z.iso.datetime({ offset: true })])
					.pipe(z.coerce.date())
					.meta({ type: 'string', format: 'date-time' }),
			}),
		)
		.default([]),
	deleted: z.boolean().default(false),
	superAdmin: z.boolean().default(false),
	role: z.enum(['Admin', 'User']).default('User'),
	status: z.enum(['Requested', 'Accepted', 'Rejected', 'Deactivated']).default('Requested'),
	createdAt: z
		.union([z.date(), z.iso.datetime({ offset: true })])
		.pipe(z.coerce.date())
		.meta({ type: 'string', format: 'date-time' }),
	updatedAt: z
		.union([z.date(), z.iso.datetime({ offset: true })])
		.pipe(z.coerce.date())
		.meta({ type: 'string', format: 'date-time' }),
});
export const PartialUserZodSchema = UserZodSchema.partial();

export type IUserZodSchema = TypeOf<typeof UserZodSchema>;
export type IUserZodSchemaInput = Omit<z.input<typeof UserZodSchema>, 'createdAt' | 'updatedAt'> &
	Partial<Pick<z.input<typeof UserZodSchema>, Extract<'createdAt' | 'updatedAt', keyof z.input<typeof UserZodSchema>>>>;
export type IPartialUserZodSchema = TypeOf<typeof PartialUserZodSchema>;
