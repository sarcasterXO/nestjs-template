/* THIS FILE WAS GENERATED AUTOMATICALLY BY the sync script. */
/* DO NOT MODIFY IT BECAUSE IT COULD BE REWRITTEN AT ANY TIME. */
/* TO REGENERATE RUN: `bun run sync` */

import { z, type infer as TypeOf } from 'zod';

export const NotificationZodSchema = z.object({
	id: z.string(),
	userId: z.string(),
	type: z.string().nullish(),
	message: z.string(),
	title: z.string(),
	read: z.boolean().default(false),
	createdAt: z
		.union([z.date(), z.iso.datetime({ offset: true })])
		.pipe(z.coerce.date())
		.meta({ type: 'string', format: 'date-time' }),
	updatedAt: z
		.union([z.date(), z.iso.datetime({ offset: true })])
		.pipe(z.coerce.date())
		.meta({ type: 'string', format: 'date-time' }),
});
export const PartialNotificationZodSchema = NotificationZodSchema.partial();

export type INotificationZodSchema = TypeOf<typeof NotificationZodSchema>;
export type INotificationZodSchemaInput = Omit<z.input<typeof NotificationZodSchema>, 'createdAt' | 'updatedAt'> &
	Partial<
		Pick<
			z.input<typeof NotificationZodSchema>,
			Extract<'createdAt' | 'updatedAt', keyof z.input<typeof NotificationZodSchema>>
		>
	>;
export type IPartialNotificationZodSchema = TypeOf<typeof PartialNotificationZodSchema>;
