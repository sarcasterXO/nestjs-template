import { z } from 'zod';

import { NotificationZodSchema, UserZodSchema } from '#app/mongoose';

import { emailSchema } from '../auth/auth.request.dto';
import { attachmentUpdateSchema } from '../lib/dtos/attachment.dto';
import { paginationQuerySchema } from '../lib/util/Pagination';

const updateUserSchema = z
	.object({
		name: UserZodSchema.shape.name.min(1),
		email: emailSchema.nullish(),
		avatarUrl: attachmentUpdateSchema.nullish(),
		status: UserZodSchema.shape.status.unwrap(),
		role: UserZodSchema.shape.role.unwrap(),
	})
	.partial();
export const UpdateUserDtoSchema = updateUserSchema.meta({ id: 'UpdateUserDto' });
export type UpdateUserDto = z.infer<typeof UpdateUserDtoSchema>;

const updateMeSchema = z
	.object({
		name: UserZodSchema.shape.name.min(1),
		avatarUrl: attachmentUpdateSchema.nullish(),
	})
	.partial();
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
	name: z.string().optional().meta({ description: 'Case-insensitive partial match on user name or email' }),
});
export const ListUsersQueryDtoSchema = listUsersQuerySchema;
export type ListUsersQueryDto = z.infer<typeof ListUsersQueryDtoSchema>;

const exportUsersQuerySchema = listUsersQuerySchema.omit({ page: true, limit: true });
export const ExportUsersQueryDtoSchema = exportUsersQuerySchema;
export type ExportUsersQueryDto = z.infer<typeof ExportUsersQueryDtoSchema>;
