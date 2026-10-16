/* THIS FILE WAS GENERATED AUTOMATICALLY BY the sync script. */
/* DO NOT MODIFY IT BECAUSE IT COULD BE REWRITTEN AT ANY TIME. */
/* TO REGENERATE RUN: `bun run sync` */

import { z, type infer as TypeOf } from 'zod';

export const AuditLogZodSchema = z.object({
	id: z.string(),
	message: z.string(),
	user: z.object({ id: z.string(), name: z.string().nullish() }),
	action: z.enum(['user created', 'user updated', 'user deleted', 'user login', 'user logout']),
	documentId: z.string().nullish(),
	changes: z.array(z.object({ field: z.string(), from: z.any().optional(), to: z.any().optional() })).optional(),
	createdAt: z
		.union([z.date(), z.iso.datetime({ offset: true })])
		.pipe(z.coerce.date())
		.meta({ type: 'string', format: 'date-time' }),
	updatedAt: z
		.union([z.date(), z.iso.datetime({ offset: true })])
		.pipe(z.coerce.date())
		.meta({ type: 'string', format: 'date-time' }),
});
export const PartialAuditLogZodSchema = AuditLogZodSchema.partial();

export type IAuditLogZodSchema = TypeOf<typeof AuditLogZodSchema>;
export type IAuditLogZodSchemaInput = Omit<z.input<typeof AuditLogZodSchema>, 'createdAt' | 'updatedAt'> &
	Partial<
		Pick<z.input<typeof AuditLogZodSchema>, Extract<'createdAt' | 'updatedAt', keyof z.input<typeof AuditLogZodSchema>>>
	>;
export type IPartialAuditLogZodSchema = TypeOf<typeof PartialAuditLogZodSchema>;
