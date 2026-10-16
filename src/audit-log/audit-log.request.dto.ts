import { z } from 'zod';

import { AuditLogZodSchema } from '#app/mongoose';

import { paginationQuerySchema } from '../lib/util/Pagination';

const listAuditLogsQuerySchema = paginationQuerySchema.extend({
	sort: z.string().optional(),
	userId: AuditLogZodSchema.shape.user.shape.id.optional(),
	action: AuditLogZodSchema.shape.action.optional(),
	date: z.string().optional().meta({ description: 'ISO date string (e.g. 2024-01-15)' }),
	search: z.string().optional().meta({ description: 'Search across message field' }),
});
export const ListAuditLogsQueryDtoSchema = listAuditLogsQuerySchema;
export type ListAuditLogsQueryDto = z.infer<typeof ListAuditLogsQueryDtoSchema>;

const exportAuditLogsQuerySchema = listAuditLogsQuerySchema.omit({ page: true, limit: true });
export const ExportAuditLogsQueryDtoSchema = exportAuditLogsQuerySchema;
export type ExportAuditLogsQueryDto = z.infer<typeof ExportAuditLogsQueryDtoSchema>;
