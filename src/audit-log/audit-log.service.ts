import { Injectable } from '@nestjs/common';

import { type IAuditLogZodSchema, MongoAuditLogService, MongoUserService } from '#app/mongoose';

import { escapeRegex } from '../lib/util/Regex';
import { assertXlsxExportSize, MAX_XLSX_EXPORT_ROWS } from '../lib/util/Xlsx';

import type { QueryFilter, SortOrder } from 'mongoose';

interface AuditLogFilters {
	sort?: Record<string, SortOrder>;
	userId?: string;
	action?: IAuditLogZodSchema['action'];
	date?: string;
	search?: string;
}

@Injectable()
export class AuditLogService {
	public constructor(
		private readonly mongoAuditLogService: MongoAuditLogService,
		private readonly mongoUserService: MongoUserService,
	) {}

	public async findAll(
		query: AuditLogFilters & { limit?: number; page?: number },
	): Promise<{ data: IAuditLogZodSchema[]; total: number }> {
		const { data, total } = await this.mongoAuditLogService.paginate(this.filterFor(query), query);
		return { data: await this.withUserNames(data), total };
	}

	public async exportAll(query: AuditLogFilters): Promise<IAuditLogZodSchema[]> {
		const filter = this.filterFor(query);
		// Counted first, so an oversized export is refused before any rows are loaded.
		assertXlsxExportSize(await this.mongoAuditLogService.count(filter));
		const data = await this.mongoAuditLogService.find(filter, '', { limit: MAX_XLSX_EXPORT_ROWS, sort: query.sort });
		return this.withUserNames(data);
	}

	private filterFor(query: AuditLogFilters): QueryFilter<IAuditLogZodSchema> {
		const filter: QueryFilter<IAuditLogZodSchema> = {};

		if (query.userId) filter['user.id'] = query.userId;
		if (query.action) filter.action = query.action;
		if (query.date) {
			// A date-only ISO string parses as UTC midnight.
			const start = new Date(query.date);
			const end = new Date(start);
			end.setUTCDate(end.getUTCDate() + 1);
			filter.createdAt = { $gte: start, $lt: end };
		}
		// A prefix match, so it can use the `message` index.
		if (query.search) filter.message = { $regex: `^${escapeRegex(query.search)}`, $options: 'i' };

		return filter;
	}

	/** Entries written without the actor's name get it from the users collection. */
	private async withUserNames(data: IAuditLogZodSchema[]): Promise<IAuditLogZodSchema[]> {
		const missingNameIds = [...new Set(data.filter((dt) => !dt.user.name).map((dt) => dt.user.id))];
		if (missingNameIds.length === 0) return data;

		const users = await this.mongoUserService.find({ id: { $in: missingNameIds } }, 'id name');
		const userMap = new Map(users.map((usr) => [usr.id, usr.name]));
		return data.map((dt) => ({ ...dt, user: { ...dt.user, name: dt.user.name ?? userMap.get(dt.user.id) ?? null } }));
	}
}
