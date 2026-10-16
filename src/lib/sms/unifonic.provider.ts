import { URLSearchParams } from 'node:url';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { request } from 'undici';

import { SmsProvider, type SmsSendResult } from './sms.provider';

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Unifonic returns 200 when a message is ACCEPTED into their platform, not when the handset
 * receives it. Handset delivery arrives later via DLR webhooks (not wired here).
 */
@Injectable()
export class UnifonicSmsProvider extends SmsProvider {
	private readonly appSid: string | undefined;
	private readonly senderId: string | undefined;
	private readonly apiUrl: string;

	public constructor(configService: ConfigService) {
		super();
		this.appSid = configService.get<string>('UNIFONIC_APP_SID');
		this.senderId = configService.get<string>('UNIFONIC_SENDER_ID');
		this.apiUrl = configService.get<string>('UNIFONIC_API_URL') || 'https://el.cloud.unifonic.com/rest/SMS/messages';
	}

	protected async dispatch(recipient: string, body: string): Promise<SmsSendResult> {
		if (!this.appSid || !this.senderId) return this.notConfigured();

		const form = new URLSearchParams({
			AppSid: this.appSid,
			SenderID: this.senderId,
			Recipient: recipient,
			Body: body,
		});

		const response = await request(this.apiUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: form.toString(),
			headersTimeout: REQUEST_TIMEOUT_MS,
			bodyTimeout: REQUEST_TIMEOUT_MS,
		});

		if (response.statusCode < 200 || response.statusCode >= 300) {
			const text = await response.body.text().catch(() => '');
			this.logger.error(`Unifonic returned ${response.statusCode} for ${recipient}: ${text}`);
			return { success: false, errorMessage: `HTTP ${response.statusCode}: ${text}` };
		}

		const payload = (await response.body.json()) as {
			success?: boolean | string;
			message?: string;
			data?: { MessageID?: string };
		};

		const accepted = payload.success === true || payload.success === 'true';
		if (!accepted) {
			this.logger.warn(`Unifonic rejected message to ${recipient}: ${payload.message ?? 'unknown'}`);
			return { success: false, errorMessage: payload.message ?? 'Unifonic rejected message' };
		}

		this.logger.log(`SMS accepted by Unifonic for ${recipient} (ref ${payload.data?.MessageID ?? 'n/a'})`);
		return { success: true, referenceId: payload.data?.MessageID };
	}
}
