import process from 'node:process';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

import { loadTemplate, MAIL_THEME, renderTemplate, type MailBrand, type MailTemplate } from './template';
import { notificationEmail } from './templates';

import type { Transporter } from 'nodemailer';

interface EmailOptions {
	to: string | string[];
	subject: string;
	text?: string;
	html?: string;
	attachments?: {
		filename: string;
		path?: string;
		content?: globalThis.Buffer | string;
		contentType?: string;
	}[];
}

export interface RenderedEmail {
	subject: string;
	html: string;
	text?: string;
}

@Injectable()
export class MailService {
	private readonly logger = new Logger(MailService.name);
	private readonly transporter: Transporter | null;
	private readonly from: string;
	private readonly brand: MailBrand;

	public constructor(configService: ConfigService) {
		const host = configService.get<string>('SMTP_HOST');
		const user = configService.get<string>('SMTP_USER');
		const name = configService.get<string>('MAIL_BRAND_NAME') || 'App';
		const company = configService.get<string>('MAIL_COMPANY_NAME') || name;

		this.brand = {
			name,
			company,
			supportEmail: configService.get<string>('MAIL_SUPPORT_EMAIL') || user || 'support@example.com',
		};
		this.from = `"${company}" <${configService.get<string>('MAIL_FROM') || user}>`;

		this.transporter = host
			? nodemailer.createTransport({
					pool: true,
					host,
					port: Number(configService.get<string>('SMTP_PORT') ?? 587),
					secure: configService.get<string>('SMTP_SECURE') === 'true',
					auth: { user, pass: configService.get<string>('SMTP_PASSWORD') },
				})
			: null;

		if (!this.transporter) this.logger.warn('SMTP_HOST not configured — emails will not be sent');
	}

	/**
	 * Renders a template from `templates/` inside the shared layout and sends it.
	 *
	 * @example
	 * await this.mailService.send(user.email, otpEmail({ otp }));
	 */
	public async send(
		to: EmailOptions['to'],
		template: MailTemplate,
		attachments?: EmailOptions['attachments'],
	): Promise<boolean> {
		return this.sendEmail({ to, attachments, ...(await this.render(template)) });
	}

	/**
	 * Sends pre-built content as-is. Text-only emails are wrapped in the notification template.
	 */
	public async sendEmail(options: EmailOptions): Promise<boolean> {
		const html =
			options.html ??
			(options.text
				? (await this.render(notificationEmail({ subject: options.subject, text: options.text }))).html
				: undefined);

		if (!this.transporter) {
			if (process.env.NODE_ENV !== 'development') return false;
			this.logger.log(`[dev] Email to ${options.to}: ${options.subject}\n${options.text ?? ''}`);
			return true;
		}

		try {
			const result = await this.transporter.sendMail({
				from: this.from,
				to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
				subject: options.subject,
				text: options.text,
				html,
				attachments: options.attachments,
			});
			this.logger.log(`Email sent successfully to ${options.to}. Message ID: ${result.messageId}`);
			return true;
		} catch (error) {
			this.logger.error(`Failed to send email to ${options.to}:`, error);
			return false;
		}
	}

	/**
	 * Renders without sending — useful for previews and tests.
	 */
	public async render(template: MailTemplate): Promise<RenderedEmail> {
		const { template: name, subject, vars, text, preheader = '' } = template(this.brand);
		const globals = {
			...MAIL_THEME,
			brandName: this.brand.name,
			companyName: this.brand.company,
			supportEmail: this.brand.supportEmail,
			year: new Date().getFullYear(),
		};

		const body = renderTemplate(await loadTemplate(name), { ...globals, ...vars });
		const html = renderTemplate(await loadTemplate('layout'), { ...globals, title: subject, preheader, body });

		return { subject, html, text };
	}
}
