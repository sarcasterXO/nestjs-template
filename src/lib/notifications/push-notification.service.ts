import process from 'node:process';

import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webPush from 'web-push';
import { z } from 'zod';

import { MongoUserService, type IUserZodSchema } from '../mongo';

export type PushSubscription = IUserZodSchema['subscriptions'][number];

export interface PushPayload {
	title: string;
	body: string;
	data?: { url: string };
}

const SUBSCRIPTION_TTL_DAYS = 60;
/** Most recent subscriptions kept per user; older ones are dropped on subscribe. */
const MAX_SUBSCRIPTIONS = 10;

/** The browsers' push services: FCM (Chrome, Edge on Android, Samsung), Mozilla, WNS (Edge) and Apple. */
const PUSH_SERVICE_HOSTNAME =
	/^(?:fcm\.googleapis\.com|(?:[\da-z-]+\.)+(?:push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com))$/;

export const pushEndpointSchema = z.url({ protocol: /^https$/, hostname: PUSH_SERVICE_HOSTNAME });

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
		const now = new Date();
		const expirationTime = new Date(now);
		expirationTime.setDate(expirationTime.getDate() + SUBSCRIPTION_TTL_DAYS);

		// Not deduped by user agent: two devices on the same browser version send identical ones.
		await this.mongoUserService.updateOne(
			{ id: userId },
			{ $pull: { subscriptions: { $or: [{ endpoint }, { expirationTime: { $lte: now } }] } } },
		);

		const updated = await this.mongoUserService.updateOne(
			{ id: userId },
			{
				$push: {
					subscriptions: { $each: [{ endpoint, keys, expirationTime, userAgent }], $slice: -MAX_SUBSCRIPTIONS },
				},
			},
			{},
			['id'],
		);

		if (!updated) throw new BadRequestException('User not found');

		return { message: 'Successfully subscribed to notifications', success: true };
	}

	public async send({ endpoint, keys }: PushSubscription, payload: PushPayload) {
		if (!this.vapidPublicKey) return;
		// Subscriptions stored before the endpoint allowlist existed are never sent to.
		if (!pushEndpointSchema.safeParse(endpoint).success) throw new Error('Push endpoint is not a known push service');
		await webPush.sendNotification({ endpoint, keys }, JSON.stringify(payload), { TTL: 60 * 60 * 2, urgency: 'high' });
	}
}
