import process from 'node:process';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Mailer } from '@nestjs/mail';

import { readMailConfig, type MailConfig } from './mail.config';
import { logMailFailure, logRetries, loggedMailErrors, MAIL_RETRY } from './mail.errors';
import { MAIL_THEME, StrictTemplateEngine } from './template';
import { mailTemplates, type MailTemplateName, type MailTemplateVars } from './templates';

interface EmailOptions {
	to: string | string[];
	subject: string;
	text?: string;
	html?: string;
	/**
	 * An address, or `{ name?, address? }`. A missing name is `MAIL_BRAND_NAME`; a missing address is `MAIL_FROM`,
	 * then `SMTP_USER`.
	 */
	from?: string | { name?: string; address?: string };
	attachments?: {
		filename: string;
		path?: string;
		content?: globalThis.Buffer | string;
		contentType?: string;
	}[];
}

/** The template's variables, optional when it has no required ones. */
type TemplateArgs<N extends MailTemplateName> =
	Partial<MailTemplateVars<N>> extends MailTemplateVars<N> ? [vars?: MailTemplateVars<N>] : [vars: MailTemplateVars<N>];
type SendArgs<N extends MailTemplateName> =
	Partial<MailTemplateVars<N>> extends MailTemplateVars<N>
		? [vars?: MailTemplateVars<N>, from?: EmailOptions['from'], attachments?: EmailOptions['attachments']]
		: [vars: MailTemplateVars<N>, from?: EmailOptions['from'], attachments?: EmailOptions['attachments']];

export interface RenderedEmail {
	subject: string;
	html: string;
	text?: string;
}

@Injectable()
export class MailService {
	private readonly logger = new Logger(MailService.name);
	private readonly config: MailConfig;

	public constructor(
		configService: ConfigService,
		private readonly mailer: Mailer,
		private readonly engine: StrictTemplateEngine,
	) {
		this.config = readMailConfig(configService);
		if (!this.config.host) this.logger.warn('SMTP_HOST not configured — emails will not be sent');
	}

	/**
	 * Renders a template from `templates/` inside the shared layout and sends it.
	 *
	 * @example
	 * await this.mailService.send(user.email, 'otp', { otp });
	 */
	public async send<N extends MailTemplateName>(
		to: EmailOptions['to'],
		template: N,
		...[vars, from, attachments]: SendArgs<N>
	): Promise<boolean> {
		return this.sendEmail({ to, from, attachments, ...(await this.build(template, vars)) });
	}

	/**
	 * Sends pre-built content as-is. Text-only emails are wrapped in the notification template.
	 */
	public async sendEmail(options: EmailOptions): Promise<boolean> {
		const html =
			options.html ??
			(options.text
				? (await this.build('notification', { subject: options.subject, text: options.text })).html
				: undefined);

		if (!this.config.host && process.env.NODE_ENV !== 'development') return false;

		const from = typeof options.from === 'string' ? { address: options.from } : options.from;
		try {
			const result = await this.mailer.send({
				to: options.to,
				subject: options.subject,
				text: options.text,
				html,
				attachments: options.attachments,
				...(from && {
					from: { name: from.name ?? this.config.from.name, address: from.address ?? this.config.from.address },
				}),
				retry: { ...MAIL_RETRY, retryIf: logRetries(this.logger, ` for ${options.to} "${options.subject}"`) },
			});
			this.logger.log(`Email sent successfully to ${options.to}. Message ID: ${result.messageId}`);
			return true;
		} catch (error) {
			if (!(error instanceof Error && loggedMailErrors.has(error))) {
				logMailFailure(this.logger, `Failed to send email to ${options.to} "${options.subject}"`, error);
			}
			return false;
		}
	}

	/**
	 * Renders without sending — useful for previews and tests.
	 */
	public async render<N extends MailTemplateName>(template: N, ...[vars]: TemplateArgs<N>): Promise<RenderedEmail> {
		return this.build(template, vars);
	}

	private async build<N extends MailTemplateName>(
		template: N,
		templateVars: MailTemplateVars<N> | undefined,
	): Promise<RenderedEmail> {
		// SendArgs only lets `templateVars` be left out when every variable is optional.
		const content = mailTemplates[template]((templateVars ?? {}) as MailTemplateVars<N>, this.config.brand);
		const { subject, vars, text, preheader = '' } = content;
		const html = await this.engine.render(template, {
			...MAIL_THEME,
			brandName: this.config.brand.name,
			companyName: this.config.brand.company,
			supportEmail: this.config.brand.supportEmail,
			year: new Date().getFullYear(),
			...vars,
			title: subject,
			preheader,
		});

		return { subject, html, text };
	}
}
