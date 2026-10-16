import { Logger } from '@nestjs/common';

export interface SmsSendResult {
	success: boolean;
	referenceId?: string;
	errorMessage?: string;
}

/**
 * Inject this, not a concrete provider. SmsModule binds it to the active implementation.
 */
export abstract class SmsProvider {
	protected readonly logger = new Logger(this.constructor.name);

	public async sendSms(recipient: string, body: string): Promise<SmsSendResult> {
		const normalizedRecipient = this.normalizeRecipient(recipient);
		if (!normalizedRecipient) {
			this.logger.warn(`Invalid recipient phone: "${recipient}" — SMS not sent`);
			return { success: false, errorMessage: `Invalid recipient phone: "${recipient}"` };
		}

		try {
			return await this.dispatch(normalizedRecipient, body);
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			this.logger.error(`Failed to send SMS to ${normalizedRecipient}: ${message}`);
			return { success: false, errorMessage: message };
		}
	}

	/**
	 * @param recipient Digits only, no leading `+` (e.g. `966500000000`).
	 */
	protected abstract dispatch(recipient: string, body: string): Promise<SmsSendResult>;

	protected notConfigured(): SmsSendResult {
		this.logger.warn('SMS credentials not configured — SMS dispatch skipped');
		return { success: false, errorMessage: 'SMS credentials not configured' };
	}

	private normalizeRecipient(recipient: string): string | null {
		const digits = recipient.replaceAll(/[\s()-]/g, '').replace(/^\+/, '');
		if (!/^\d{8,15}$/.test(digits)) return null;
		return digits;
	}
}
