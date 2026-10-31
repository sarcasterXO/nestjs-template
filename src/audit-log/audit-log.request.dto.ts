import { z } from 'zod';

import { AuditLogZodSchema } from '#app/mongoose';

import { paginationQuerySchema } from '../lib/util/Pagination';

const listAuditLogsQuerySchema = paginationQuerySchema.extend({
	sort: z.string().optional(),
	userId: AuditLogZodSchema.shape.user.shape.id.optional(),
	action: AuditLogZodSchema.shape.action.optional(),
	date: z.iso.date().optional().meta({ description: 'UTC day as an ISO date (e.g. 2024-01-15)' }),
	search: z.string().optional().meta({ description: 'Case-insensitive match on the start of the message' }),
});
export const ListAuditLogsQueryDtoSchema = listAuditLogsQuerySchema;
export type ListAuditLogsQueryDto = z.infer<typeof ListAuditLogsQueryDtoSchema>;

const exportAuditLogsQuerySchema = listAuditLogsQuerySchema.omit({ page: true, limit: true });
export const ExportAuditLogsQueryDtoSchema = exportAuditLogsQuerySchema;
export type ExportAuditLogsQueryDto = z.infer<typeof ExportAuditLogsQueryDtoSchema>;
