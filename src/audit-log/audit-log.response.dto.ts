import { z } from 'zod';

import { AuditLogZodSchema } from '#app/mongoose';

import { paginatedSchema } from '../lib/util/Pagination';

export const AuditLogDtoSchema = AuditLogZodSchema.meta({ id: 'AuditLogDto' });

export const AuditLogsDtoSchema = z.array(AuditLogZodSchema).meta({ id: 'AuditLogsDto' });

export const PaginatedAuditLogsDtoSchema = paginatedSchema(AuditLogZodSchema).meta({ id: 'PaginatedAuditLogsDto' });
export type PaginatedAuditLogsDto = z.infer<typeof PaginatedAuditLogsDtoSchema>;
