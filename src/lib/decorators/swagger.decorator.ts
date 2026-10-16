import { HttpCode, HttpStatus, applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse, type ApiResponseOptions } from '@nestjs/swagger';

import { ErrorDtoSchema } from '../dtos/response.dto';
import { PAGINATION_HEADERS } from '../util/Pagination';
import { ResponseSchema } from '../zod';

import type { z } from 'zod';

export function Swagger(description: string, successSchema?: z.ZodType, errorSchema?: z.ZodType) {
	return swaggerResponses(description, successSchema, errorSchema);
}

export function SwaggerPaginated(description: string, successSchema: z.ZodType) {
	const headers = Object.fromEntries(
		Object.entries(PAGINATION_HEADERS).map(([name, desc]) => [
			name,
			{ description: desc, schema: { type: 'integer' } },
		]),
	);
	return swaggerResponses(description, successSchema, undefined, headers);
}

function swaggerResponses(
	description: string,
	successSchema: z.ZodType | undefined,
	errorSchema: z.ZodType = ErrorDtoSchema,
	headers?: ApiResponseOptions['headers'],
) {
	return applyDecorators(
		...(successSchema ? [ResponseSchema(successSchema)] : []),
		ApiOperation({
			summary: description,
		}),
		HttpCode(HttpStatus.OK),
		ApiResponse({
			status: 200,
			description: 'Returns success if request is successful',
			standardSchema: successSchema,
			headers,
		}),
		ApiResponse({
			status: 400,
			description: 'Bad Request',
			standardSchema: errorSchema,
		}),
		ApiResponse({
			status: 401,
			description: 'Unauthorized',
			standardSchema: errorSchema,
		}),
		ApiResponse({
			status: 403,
			description: 'Forbidden',
			standardSchema: errorSchema,
		}),
		ApiResponse({
			status: 404,
			description: 'Not Found',
			standardSchema: errorSchema,
		}),
		ApiResponse({
			status: 422,
			description: 'Returns error if validation fails',
			standardSchema: errorSchema,
		}),
		ApiResponse({
			status: 500,
			description: 'Internal Server Error',
			standardSchema: errorSchema,
		}),
	);
}
