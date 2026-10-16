import { z } from 'zod';

import type { FastifyReply } from 'fastify';

export const PAGINATION_HEADERS = {
	'X-Total-Count': 'Total number of matching items',
	'X-Total-Pages': 'Total number of pages',
	'X-Current-Page': 'Current page number',
	'X-Per-Page': 'Number of items on this page',
};

export const paginationQuerySchema = z.object({
	page: z
		.union([z.enum(['all', '-1']).transform(() => undefined), z.coerce.number().int().positive()])
		.optional()
		.meta({ description: 'Page number. Omit it, or pass "all" or -1, to return every match.' }),
	limit: z.coerce.number().int().positive().default(10).meta({ description: 'Items per page when `page` is set.' }),
});
export const PaginationQueryDtoSchema = paginationQuerySchema;
export type PaginationQueryDto = z.infer<typeof PaginationQueryDtoSchema>;

export function paginatedSchema<T extends z.ZodType>(item: T) {
	return z.object({ data: z.array(item), total: z.number() });
}

export function sendPaginated<T>(
	reply: FastifyReply,
	result: { data: T[]; total: number },
	page: number | undefined,
	limit: number,
): { data: T[]; total: number } {
	void reply.headers({
		'X-Total-Count': result.total,
		'X-Total-Pages': page === undefined ? 1 : Math.ceil(result.total / limit),
		'X-Current-Page': page ?? 1,
		'X-Per-Page': result.data.length,
	});
	return result;
}
