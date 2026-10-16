import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import {
	type ExportAuditLogsQueryDto,
	ExportAuditLogsQueryDtoSchema,
	type ListAuditLogsQueryDto,
	ListAuditLogsQueryDtoSchema,
} from './audit-log.request.dto';
import { type PaginatedAuditLogsDto, PaginatedAuditLogsDtoSchema } from './audit-log.response.dto';
import { AuditLogService } from './audit-log.service';

import { RequirePermissions } from '../lib/decorators/auth.decorator';
import { SwaggerPaginated } from '../lib/decorators/swagger.decorator';
import { RateLimitGuard } from '../lib/guard/rateLimitGuard.guard';
import { sendPaginated } from '../lib/util/Pagination';
import { Permissions } from '../lib/util/Permissions';
import { parseSortQuery } from '../lib/util/Sort';
import { toXlsxBuffer, xlsxFilename, XLSX_CONTENT_TYPE } from '../lib/util/Xlsx';

import type { FastifyReply } from 'fastify';
import type { Buffer } from 'node:buffer';

const SORTABLE_FIELDS = ['createdAt', 'action', 'user.name', 'documentId'];

@ApiTags('Audit Log')
@Controller('audit-log')
export class AuditLogController {
	public constructor(private readonly auditLogService: AuditLogService) {}

	// ==================== GET ROUTES ====================

	@SwaggerPaginated('Get all audit logs', PaginatedAuditLogsDtoSchema)
	@UseGuards(new RateLimitGuard(20, 1))
	@RequirePermissions([Permissions.AuditLog.View])
	@Get()
	public async getAll(
		@Res({ passthrough: true }) reply: FastifyReply,
		@Query({ schema: ListAuditLogsQueryDtoSchema }) query: ListAuditLogsQueryDto,
	): Promise<PaginatedAuditLogsDto> {
		const { sort, page, limit, ...rest } = query;
		const result = await this.auditLogService.findAll({
			...rest,
			page,
			limit,
			sort: sort ? parseSortQuery(sort, SORTABLE_FIELDS) : undefined,
		});
		return sendPaginated(reply, result, page, limit);
	}

	@ApiOperation({ summary: 'Export audit logs matching filters as XLSX (no pagination)' })
	@UseGuards(new RateLimitGuard(5, 5 / 60))
	@RequirePermissions([Permissions.AuditLog.Export])
	@Get('export')
	public async exportXlsx(
		@Res({ passthrough: true }) reply: FastifyReply,
		@Query({ schema: ExportAuditLogsQueryDtoSchema }) query: ExportAuditLogsQueryDto,
	): Promise<Buffer> {
		const { sort, ...rest } = query;
		const { data } = await this.auditLogService.findAll({
			...rest,
			sort: sort ? parseSortQuery(sort, SORTABLE_FIELDS) : undefined,
		});

		const buffer = await toXlsxBuffer(data, [
			{ header: 'ID', value: (row) => row.id },
			{ header: 'Date', value: (row) => row.createdAt },
			{ header: 'User', value: (row) => row.user.name ?? row.user.id },
			{ header: 'User ID', value: (row) => row.user.id },
			{ header: 'Action', value: (row) => row.action },
			{ header: 'Message', value: (row) => row.message },
			{ header: 'Document ID', value: (row) => row.documentId ?? '' },
			{
				header: 'Changes',
				value: (row) =>
					row.changes?.map((change) => `${change.field}: ${change.from} -> ${change.to}`).join('; ') ?? '',
			},
		]);

		void reply.header('Content-Type', XLSX_CONTENT_TYPE);
		void reply.header('Content-Disposition', `attachment; filename="${xlsxFilename('audit-logs')}"`);
		return buffer;
	}
}
