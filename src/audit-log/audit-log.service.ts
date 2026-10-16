import { Injectable } from '@nestjs/common';

import { type IAuditLogZodSchema, MongoAuditLogService, MongoUserService } from '#app/mongoose';

import { escapeRegex } from '../lib/util/Regex';

import type { QueryFilter, SortOrder } from 'mongoose';

@Injectable()
export class AuditLogService {
	public constructor(
		private readonly mongoAuditLogService: MongoAuditLogService,
		private readonly mongoUserService: MongoUserService,
	) {}

	public async findAll(query: {
		limit?: number;
		page?: number;
		sort?: Record<string, SortOrder>;
		userId?: string;
		action?: IAuditLogZodSchema['action'];
		date?: string;
		search?: string;
	}): Promise<{ data: IAuditLogZodSchema[]; total: number }> {
		const filter: QueryFilter<IAuditLogZodSchema> = {};

		if (query.userId) filter['user.id'] = query.userId;
		if (query.action) filter.action = query.action;
		if (query.date) {
			const start = new Date(query.date);
			start.setHours(0, 0, 0, 0);
			const end = new Date(query.date);
			end.setHours(23, 59, 59, 999);
			filter.createdAt = { $gte: start, $lte: end };
		}
		if (query.search) filter.message = { $regex: escapeRegex(query.search), $options: 'i' };

		const { data, total } = await this.mongoAuditLogService.paginate(filter, query);

		const missingNameIds = [...new Set(data.filter((dt) => !dt.user.name).map((dt) => dt.user.id))];
		if (missingNameIds.length === 0) return { data, total };

		const users = await this.mongoUserService.find({ id: { $in: missingNameIds } }, 'id name');
		const userMap = new Map(users.map((usr) => [usr.id, usr.name]));
		return {
			data: data.map((dt) => ({ ...dt, user: { ...dt.user, name: dt.user.name ?? userMap.get(dt.user.id) ?? null } })),
			total,
		};
	}
}
