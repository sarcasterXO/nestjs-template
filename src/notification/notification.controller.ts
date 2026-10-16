import { Controller, Get, UseGuards, Query, Patch, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { type PaginatedNotificationsDto, PaginatedNotificationsDtoSchema } from './notification.response.dto';
import { NotificationService } from './notification.service';

import { Auth } from '../lib/decorators/auth.decorator';
import { Swagger, SwaggerPaginated } from '../lib/decorators/swagger.decorator';
import { User } from '../lib/decorators/user.decorator';
import { RateLimitGuard } from '../lib/guard/rateLimitGuard.guard';
import { type PaginationQueryDto, PaginationQueryDtoSchema, sendPaginated } from '../lib/util/Pagination';

import type { IUserZodSchema } from '#app/mongoose';
import type { FastifyReply } from 'fastify';

@ApiTags('Notification')
@Controller('notification')
export class NotificationController {
	public constructor(private readonly notificationService: NotificationService) {}

	// ==================== GET ROUTES ====================

	@SwaggerPaginated('Get all notifications', PaginatedNotificationsDtoSchema)
	@UseGuards(new RateLimitGuard(60, 1)) // 60 requests per minute
	@Auth()
	@Get()
	public async findAll(
		@Res({ passthrough: true }) reply: FastifyReply,
		@User() user: IUserZodSchema,
		@Query({ schema: PaginationQueryDtoSchema }) { page, limit }: PaginationQueryDto,
	): Promise<PaginatedNotificationsDto> {
		const result = await this.notificationService.findAll({ page, limit }, user.id);
		return sendPaginated(reply, result, page, limit);
	}

	@Swagger('Get total unread notifications count', z.number())
	@UseGuards(new RateLimitGuard(100, 1)) // 60 requests per minute
	@Auth()
	@Get('count/unread')
	public async getUnreadCount(@User() user: IUserZodSchema): Promise<number> {
		return this.notificationService.getUnreadCount(user.id);
	}

	// ==================== PATCH ROUTES ====================

	@Swagger('Mark notifications as read', z.boolean())
	@UseGuards(new RateLimitGuard(50, 50 / 60)) // 50 requests per minute
	@Auth()
	@Patch('read/all')
	public async markAllAsRead(@User() user: IUserZodSchema): Promise<boolean> {
		return this.notificationService.markAsRead(user.id);
	}
}
