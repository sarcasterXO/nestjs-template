export const Permissions = {
	Users: {
		View: 'Users.View',
		Export: 'Users.Export',
		Update: 'Users.Update',
		Delete: 'Users.Delete',
		Notify: 'Users.Notify',
	},
	AuditLog: {
		View: 'AuditLog.View',
		Export: 'AuditLog.Export',
	},
	Roles: {
		View: 'Roles.View',
	},
} as const;

type ValuesOf<T> = T[keyof T];
export type Permission = ValuesOf<{ [K in keyof typeof Permissions]: ValuesOf<(typeof Permissions)[K]> }>;

export const PermissionLabels = {
	'Users.View': 'View Users',
	'Users.Export': 'Export Users',
	'Users.Update': 'Update Users',
	'Users.Delete': 'Delete Users',
	'Users.Notify': 'Notify Users',
	'AuditLog.View': 'View Audit Log',
	'AuditLog.Export': 'Export Audit Log',
	'Roles.View': 'View Roles & Permissions',
} as const satisfies Record<Permission, string>;

export const PermissionGroups = Object.entries(Permissions).map(([category, group]) => ({
	category,
	permissions: Object.values<Permission>(group).map((key) => ({ key, label: PermissionLabels[key] })),
}));

export const AllPermissions = PermissionGroups.flatMap((group) => group.permissions.map((p) => p.key));

export const RoleNames = ['Admin', 'User'] as const;
export type RoleName = (typeof RoleNames)[number];

export const Roles = {
	Admin: { description: 'Full access to every permission.', permissions: AllPermissions },
	User: {
		description: 'Standard account that can only view and update its own profile.',
		permissions: [],
	},
} satisfies Record<RoleName, { description: string; permissions: Permission[] }>;

export function permissionsFor(user: { role: RoleName; superAdmin: boolean }): Set<Permission> {
	return new Set(user.superAdmin ? AllPermissions : Roles[user.role].permissions);
}
