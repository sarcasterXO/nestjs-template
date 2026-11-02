import type { MailBrand } from './template';
import type { ConfigService } from '@nestjs/config';

export interface MailConfig {
	host?: string;
	port: number;
	secure: boolean;
	user?: string;
	password?: string;
	from: { name: string; address: string };
	brand: MailBrand;
}

export function readMailConfig(configService: ConfigService): MailConfig {
	const host = configService.get<string>('SMTP_HOST');
	const user = configService.get<string>('SMTP_USER');
	const name = configService.get<string>('MAIL_BRAND_NAME') || 'App';
	const fromAddress = configService.get<string>('MAIL_FROM') || user;
	// `||`, not `??`: an empty `SMTP_PORT=` in .env means the default, not port 0.
	const port = Number(configService.get<string>('SMTP_PORT') || 587);

	if (host) {
		if (!fromAddress) throw new Error('MAIL_FROM or SMTP_USER must be set when SMTP_HOST is set');
		if (!Number.isInteger(port) || port < 1 || port > 65_535) {
			throw new Error(`SMTP_PORT must be a port number, got "${configService.get<string>('SMTP_PORT')}"`);
		}
	}

	const supportEmail = configService.get<string>('MAIL_SUPPORT_EMAIL') || user || 'support@example.com';
	return {
		host,
		port,
		secure: configService.get<string>('SMTP_SECURE') === 'true',
		user,
		password: configService.get<string>('SMTP_PASSWORD'),
		from: { name, address: fromAddress || supportEmail },
		brand: { name, company: configService.get<string>('MAIL_COMPANY_NAME') || name, supportEmail },
	};
}
