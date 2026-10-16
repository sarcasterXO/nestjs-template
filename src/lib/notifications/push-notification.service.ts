import process from 'node:process';

import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webPush from 'web-push';

import { MongoUserService, type IUserZodSchema } from '../mongo';

export type PushSubscription = IUserZodSchema['subscriptions'][number];

export interface PushPayload {
	title: string;
	body: string;
	data?: { url: string };
}

const SUBSCRIPTION_TTL_DAYS = 60;

@Injectable()
export class PushNotificationService {
	private readonly logger = new Logger(PushNotificationService.name);
	private readonly vapidPublicKey: string | null;

	public constructor(
		private readonly mongoUserService: MongoUserService,
		configService: ConfigService,
	) {
		const publicKey = configService.get<string>('VAPID_PUBLIC_KEY');
		const privateKey = configService.get<string>('VAPID_PRIVATE_KEY');
		const subject = configService.get<string>('VAPID_SUBJECT');

		try {
			if (!publicKey || !privateKey || !subject) {
				throw new Error(
					'VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT must be configured for push notifications',
				);
			}
			webPush.setVapidDetails(subject, publicKey, privateKey);
			this.vapidPublicKey = publicKey;
		} catch (error) {
			if (process.env.NODE_ENV !== 'development') throw error;
			this.vapidPublicKey = null;
			this.logger.warn(`Push notifications disabled: ${error instanceof Error ? error.message : error}`);
		}
	}

	public getPublicKey(): string {
		if (!this.vapidPublicKey) throw new ServiceUnavailableException('Push notifications are not configured');
		return this.vapidPublicKey;
	}

	public async subscribe(
		{ endpoint, keys }: Pick<PushSubscription, 'endpoint' | 'keys'>,
		userId: string,
		userAgent?: string,
	) {
		const expirationTime = new Date();
		expirationTime.setDate(expirationTime.getDate() + SUBSCRIPTION_TTL_DAYS);

		await this.mongoUserService.updateOne(
			{ id: userId },
			{ $pull: { subscriptions: userAgent ? { $or: [{ endpoint }, { userAgent }] } : { endpoint } } },
		);

		const updated = await this.mongoUserService.updateOne(
			{ id: userId },
			{ $push: { subscriptions: { endpoint, keys, expirationTime, userAgent } } },
			{},
			['id'],
		);

		if (!updated) throw new BadRequestException('User not found');

		return { message: 'Successfully subscribed to notifications', success: true };
	}

	public async send({ endpoint, keys }: PushSubscription, payload: PushPayload) {
		if (!this.vapidPublicKey) return;
		await webPush.sendNotification({ endpoint, keys }, JSON.stringify(payload), { TTL: 60 * 60 * 2, urgency: 'high' });
	}
}
