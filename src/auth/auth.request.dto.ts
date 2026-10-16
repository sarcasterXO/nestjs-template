import { z } from 'zod';

import { UserZodSchema } from '#app/mongoose';

export const emailSchema = z
	.email()
	.transform((email) => email.toLowerCase())
	.meta({ type: 'string', format: 'email' });

export const passwordSchema = UserZodSchema.shape.password
	.min(8, { message: 'Password must be at least 8 characters.' })
	.max(128);

const registerSchema = z.object({
	name: UserZodSchema.shape.name.min(1),
	email: emailSchema,
	password: passwordSchema,
});
export const RegisterDtoSchema = registerSchema.meta({ id: 'RegisterDto' });
export type RegisterDto = z.infer<typeof RegisterDtoSchema>;

const loginSchema = z.object({
	email: emailSchema,
	password: UserZodSchema.shape.password.min(1, { message: 'Password is required.' }),
});
export const LoginDtoSchema = loginSchema.meta({ id: 'LoginDto' });
export type LoginDto = z.infer<typeof LoginDtoSchema>;

const refreshSchema = z.object({ refreshToken: z.string() });
export const RefreshDtoSchema = refreshSchema.meta({ id: 'RefreshDto' });
export type RefreshDto = z.infer<typeof RefreshDtoSchema>;

const changePasswordSchema = z.object({
	currentPassword: UserZodSchema.shape.password.min(1, { message: 'Current password is required.' }),
	newPassword: passwordSchema,
});
export const ChangePasswordDtoSchema = changePasswordSchema.meta({ id: 'ChangePasswordDto' });
export type ChangePasswordDto = z.infer<typeof ChangePasswordDtoSchema>;
