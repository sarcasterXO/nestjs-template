import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { WebPushError } from 'web-push';

import { PushNotificationService, type PushPayload, type PushSubscription } from './push-notification.service';

import { MailService } from '../mail';
import { MongoNotificationService, MongoUserService } from '../mongo';
import { SmsProvider } from '../sms';

export interface ChannelMessage {
	text: string;
	subject: string;
	html?: string;
}

export interface ChannelRecipient {
	phone?: string | null;
	email?: string | null;
}

export interface ChannelResult {
	smsSent: boolean;
	emailSent: boolean;
}

@Injectable()
export class NotificationsService {
	private readonly logger = new Logger(NotificationsService.name);

	public constructor(
		private readonly pushNotificationService: PushNotificationService,
		private readonly mailService: MailService,
		private readonly smsProvider: SmsProvider,
		private readonly mongoUserService: MongoUserService,
		private readonly mongoNotificationService: MongoNotificationService,
	) {}

	/**
	 * In-app feed + web push to every live subscription of the user.
	 */
	public async notifyUser(userId: string, payload: PushPayload): Promise<void> {
		const user = await this.mongoUserService.findOne({ id: userId }, ['subscriptions']);
		if (!user) throw new NotFoundException('User not found');

		const now = new Date();
		const subscriptions = user.subscriptions.filter((sub) => !sub.expirationTime || sub.expirationTime > now);

		await Promise.all([
			...subscriptions.map(async (sub) => this.sendPush(userId, sub, payload)),
			this.saveInApp(userId, payload),
		]);
	}

	/**
	 * SMS and email in parallel for OTP / critical alerts, so the message still lands when one channel is unreachable.
	 */
	public async sendSmsAndEmail(recipient: ChannelRecipient, message: ChannelMessage): Promise<ChannelResult> {
		const [smsSent, emailSent] = await Promise.all([
			recipient.phone ? this.smsProvider.sendSms(recipient.phone, message.text).then((r) => r.success) : false,
			recipient.email
				? this.mailService.sendEmail({
						to: recipient.email,
						subject: message.subject,
						text: message.text,
						html: message.html,
					})
				: false,
		]);

		if (!smsSent && !emailSent) {
			this.logger.warn(
				`Channel dispatch failed on both legs (phone: ${recipient.phone ?? 'none'}, email: ${recipient.email ?? 'none'})`,
			);
		}

		return { smsSent, emailSent };
	}

	private async sendPush(userId: string, subscription: PushSubscription, payload: PushPayload) {
		try {
			await this.pushNotificationService.send(subscription, payload);
		} catch (error) {
			if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
				await this.mongoUserService.updateOne(
					{ id: userId },
					{ $pull: { subscriptions: { endpoint: subscription.endpoint } } },
				);
				return;
			}
			this.logger.warn(
				`Failed to send push notification to ${userId}: ${error instanceof Error ? error.message : error}`,
			);
		}
	}

	private async saveInApp(userId: string, { title, body }: PushPayload) {
		try {
			await this.mongoNotificationService.create({ userId, title, message: body, read: false });
		} catch (error) {
			this.logger.error('Failed to persist notification', error);
		}
	}
}
