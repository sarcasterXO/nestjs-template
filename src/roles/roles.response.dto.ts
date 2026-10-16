import { z } from 'zod';

import { AllPermissions, RoleNames } from '../lib/util/Permissions';

const permissionSchema = z.enum(AllPermissions);

const roleSchema = z.object({
	name: z.enum(RoleNames),
	description: z.string(),
	permissions: z.array(permissionSchema),
});
export const RolesDtoSchema = z.array(roleSchema).meta({ id: 'RolesDto' });
export type RolesDto = z.infer<typeof RolesDtoSchema>;

const permissionGroupSchema = z.object({
	category: z.string(),
	permissions: z.array(z.object({ key: permissionSchema, label: z.string() })),
});
export const PermissionGroupsDtoSchema = z.array(permissionGroupSchema).meta({ id: 'PermissionGroupsDto' });
export type PermissionGroupsDto = z.infer<typeof PermissionGroupsDtoSchema>;
