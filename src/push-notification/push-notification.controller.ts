import { Body, Controller, Get, Headers, Post, UseGuards } from '@nestjs/common';

import { type PushSubscriptionDto, PushSubscriptionDtoSchema } from './push-notification.request.dto';

import { Auth } from '../lib/decorators/auth.decorator';
import { Swagger } from '../lib/decorators/swagger.decorator';
import { User } from '../lib/decorators/user.decorator';
import { type PublicKeyDto, PublicKeyDtoSchema, type SuccessDto, SuccessDtoSchema } from '../lib/dtos/response.dto';
import { RateLimitGuard } from '../lib/guard/rateLimitGuard.guard';
import { PushNotificationService } from '../lib/notifications';

import type { IUserZodSchema } from '../lib/mongo/zod';

@Controller('push-notifications')
export class PushNotificationController {
	constructor(private readonly pushService: PushNotificationService) {}

	// ==================== GET ROUTES ====================

	@Swagger('Get public key', PublicKeyDtoSchema)
	@UseGuards(new RateLimitGuard(30, 2))
	@Auth()
	@Get('public-key')
	getPublicKey(): PublicKeyDto {
		return { publicKey: this.pushService.getPublicKey() };
	}

	// ==================== POST ROUTES ====================

	@Swagger('Subscribe to push notifications', SuccessDtoSchema)
	@UseGuards(new RateLimitGuard(10, 0.5))
	@Auth()
	@Post('subscribe')
	subscribe(
		@Body({ schema: PushSubscriptionDtoSchema }) subscription: PushSubscriptionDto,
		@User() user: IUserZodSchema,
		@Headers('user-agent') userAgent?: string,
	): Promise<SuccessDto> {
		return this.pushService.subscribe(subscription, user.id, userAgent);
	}
}
