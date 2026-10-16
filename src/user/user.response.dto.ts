import { z } from 'zod';

import { UserZodSchema } from '../lib/mongo/zod';
import { paginatedSchema } from '../lib/util/Pagination';
import { AllPermissions } from '../lib/util/Permissions';

const userBaseSchema = UserZodSchema.omit({ sessions: true, password: true, subscriptions: true });

const apiAuthUserSchema = userBaseSchema.extend({
	accessToken: z.string().optional().nullish(),
	refreshToken: z.string().optional().nullish(),
});
export const APIAuthUserDtoSchema = apiAuthUserSchema.meta({ id: 'APIAuthUserDto' });
export type APIAuthUserDto = z.infer<typeof APIAuthUserDtoSchema>;

const updateUserResponseSchema = z.object({
	user: APIAuthUserDtoSchema,
	message: z.string(),
});
export const UpdateUserResponseDtoSchema = updateUserResponseSchema.meta({ id: 'UpdateUserResponseDto' });
export type UpdateUserResponseDto = z.infer<typeof UpdateUserResponseDtoSchema>;

const meSchema = userBaseSchema.extend({ permissions: z.array(z.enum(AllPermissions)) });
export const UserMeDtoSchema = meSchema.meta({ id: 'UserMeDto' });
export type UserMeDto = z.infer<typeof UserMeDtoSchema>;

const registerResponseSchema = userBaseSchema.extend({
	message: z.string(),
});
export const RegisterResponseDtoSchema = registerResponseSchema.meta({ id: 'RegisterResponseDto' });
export type RegisterResponseDto = z.infer<typeof RegisterResponseDtoSchema>;

const logoutSchema = z.object({
	message: z.string(),
});
export const LogoutDtoSchema = logoutSchema.meta({ id: 'LogoutDto' });
export type LogoutDto = z.infer<typeof LogoutDtoSchema>;

export const ChangePasswordResponseDtoSchema = logoutSchema.meta({ id: 'ChangePasswordResponseDto' });
export type ChangePasswordResponseDto = z.infer<typeof ChangePasswordResponseDtoSchema>;

export const PaginatedUsersDtoSchema = paginatedSchema(userBaseSchema).meta({ id: 'PaginatedUsersDto' });
export type PaginatedUsersDto = z.infer<typeof PaginatedUsersDtoSchema>;
