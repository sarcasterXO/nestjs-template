import { z } from 'zod';

import { NotificationZodSchema, UserZodSchema } from '#app/mongoose';

import { emailSchema } from '../auth/auth.request.dto';
import { imageAttachmentUpdateSchema } from '../lib/dtos/attachment.dto';
import { paginationQuerySchema } from '../lib/util/Pagination';

const { countryCode, number } = UserZodSchema.shape.phone.unwrap().unwrap().shape;
const phoneUpdateSchema = z
	.object({
		countryCode: countryCode.trim().regex(/^\+\d{1,4}$/, 'Country code must look like +1.'),
		number: number.trim().regex(/^\d+$/, 'Phone number must contain digits only.'),
	})
	.refine(
		({ countryCode, number }) => {
			const digits = countryCode.length - 1 + number.length;
			return digits >= 8 && digits <= 15;
		},
		{ message: 'Phone number must be 8 to 15 digits including the country code.', path: ['number'] },
	)
	.nullable();

const updateUserSchema = z
	.object({
		name: UserZodSchema.shape.name.min(1),
		email: emailSchema.nullish(),
		avatarUrl: imageAttachmentUpdateSchema.nullish(),
		phone: phoneUpdateSchema,
		status: UserZodSchema.shape.status.unwrap(),
		role: UserZodSchema.shape.role.unwrap(),
	})
	.partial();
export const UpdateUserDtoSchema = updateUserSchema.meta({ id: 'UpdateUserDto' });
export type UpdateUserDto = z.infer<typeof UpdateUserDtoSchema>;

// Only profile fields: role, status and superAdmin are never self-service, whoever the user is.
const updateMeSchema = z
	.object({
		name: UserZodSchema.shape.name.min(1),
		email: emailSchema,
		currentPassword: UserZodSchema.shape.password
			.min(1)
			.meta({ description: 'Required when changing `email`, so a stolen access token cannot take over the account' }),
		avatarUrl: imageAttachmentUpdateSchema.nullish(),
		phone: phoneUpdateSchema,
	})
	.partial()
	.refine(({ email, currentPassword }) => email === undefined || currentPassword !== undefined, {
		message: 'Current password is required to change the email.',
		path: ['currentPassword'],
	});
export const UpdateMeDtoSchema = updateMeSchema.meta({ id: 'UpdateMeDto' });
export type UpdateMeDto = z.infer<typeof UpdateMeDtoSchema>;

const deleteUserSchema = z.object({
	userId: UserZodSchema.shape.id.min(1, { message: 'User ID is required.' }),
});
export const DeleteUserDtoSchema = deleteUserSchema.meta({ id: 'DeleteUserDto' });
export type DeleteUserDto = z.infer<typeof DeleteUserDtoSchema>;

const sendNotificationSchema = z.object({
	message: NotificationZodSchema.shape.message.min(1, { message: 'Message is required.' }),
});
export const SendNotificationDtoSchema = sendNotificationSchema.meta({ id: 'SendNotificationDto' });
export type SendNotificationDto = z.infer<typeof SendNotificationDtoSchema>;

const listUsersQuerySchema = paginationQuerySchema.extend({
	sort: z.string().optional(),
	name: z.string().optional().meta({ description: 'Case-insensitive match on the start of the user name or email' }),
});
export const ListUsersQueryDtoSchema = listUsersQuerySchema;
export type ListUsersQueryDto = z.infer<typeof ListUsersQueryDtoSchema>;

const exportUsersQuerySchema = listUsersQuerySchema.omit({ page: true, limit: true });
export const ExportUsersQueryDtoSchema = exportUsersQuerySchema;
export type ExportUsersQueryDto = z.infer<typeof ExportUsersQueryDtoSchema>;
