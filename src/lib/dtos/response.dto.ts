import { z } from 'zod';

const errorSchema = z.object({
	message: z.string().optional(),
	error: z.string().optional(),
	statusCode: z.number().optional(),
});
export const ErrorDtoSchema = errorSchema.meta({ id: 'ErrorDto' });
export type ErrorDto = z.infer<typeof ErrorDtoSchema>;

const successSchema = z.object({
	message: z.string(),
	success: z.boolean(),
});
export const SuccessDtoSchema = successSchema.meta({ id: 'SuccessDto' });
export type SuccessDto = z.infer<typeof SuccessDtoSchema>;

const numberResponseSchema = z.object({
	response: z.number(),
});
export const NumberResponseDtoSchema = numberResponseSchema.meta({ id: 'NumberResponseDto' });
export type NumberResponseDto = z.infer<typeof NumberResponseDtoSchema>;

export const AnyBodyDtoSchema = z.any().meta({ id: 'AnyBodyDto' });

const publicKeySchema = z.object({
	publicKey: z.string(),
});
export const PublicKeyDtoSchema = publicKeySchema.meta({ id: 'PublicKeyDto' });
export type PublicKeyDto = z.infer<typeof PublicKeyDtoSchema>;
