import { Injectable } from '@nestjs/common';

import { MongoNotificationService } from '../lib/mongo';

import type { INotificationZodSchema } from '../lib/mongo/zod';

@Injectable()
export class NotificationService {
	public constructor(private readonly mongoNotificationService: MongoNotificationService) {}

	public async findAll(
		{ page, limit }: { page?: number; limit: number },
		userId: string,
	): Promise<{ data: INotificationZodSchema[]; total: number }> {
		return this.mongoNotificationService.paginate({ userId }, { page, limit, sort: { createdAt: -1 } });
	}

	public async getUnreadCount(userId: string): Promise<number> {
		return this.mongoNotificationService.count({ read: false, userId });
	}

	public async markAsRead(userId: string): Promise<boolean> {
		await this.mongoNotificationService.updateMany({ userId, read: false }, { read: true });
		return true;
	}
}
