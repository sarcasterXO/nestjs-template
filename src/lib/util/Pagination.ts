import { z } from 'zod';

import type { FastifyReply } from 'fastify';

export const MAX_PAGE_LIMIT = 100;

export const PAGINATION_HEADERS = {
	'X-Total-Count': 'Total number of matching items',
	'X-Total-Pages': 'Total number of pages',
	'X-Current-Page': 'Current page number',
	'X-Per-Page': 'Page size requested',
};

export const paginationQuerySchema = z.object({
	page: z.coerce.number().int().positive().default(1).meta({ description: 'Page number, defaults to 1.' }),
	limit: z.coerce
		.number()
		.int()
		.positive()
		.max(MAX_PAGE_LIMIT)
		.default(10)
		.meta({ description: `Items per page (max ${MAX_PAGE_LIMIT}).` }),
});
export const PaginationQueryDtoSchema = paginationQuerySchema;
export type PaginationQueryDto = z.infer<typeof PaginationQueryDtoSchema>;

export function paginatedSchema<T extends z.ZodType>(item: T) {
	return z.object({ data: z.array(item), total: z.number() });
}

export function sendPaginated<T>(
	reply: FastifyReply,
	result: { data: T[]; total: number },
	page: number,
	limit: number,
): { data: T[]; total: number } {
	void reply.headers({
		'X-Total-Count': result.total,
		'X-Total-Pages': Math.ceil(result.total / limit),
		'X-Current-Page': page,
		'X-Per-Page': limit,
	});
	return result;
}
