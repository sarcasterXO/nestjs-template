import { Global, Logger, Module, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LogMailTransport, MailEvents, MailModule as NestMailModule, SmtpTransport } from '@nestjs/mail';

import { readMailConfig } from './mail.config';
import { logMailFailure, logRetries, loggedMailErrors, MAIL_RETRY } from './mail.errors';
import { MailService } from './mail.service';
import { StrictTemplateEngine } from './template';

const logger = new Logger('MailModule');
// The hosts SmtpTransport treats as local, where STARTTLS is opportunistic.
const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|::1|\[::1\])$|\.localhost$/i;

@Global()
@Module({
	imports: [
		NestMailModule.forRootAsync({
			inject: [ConfigService],
			templates: StrictTemplateEngine,
			useFactory: (configService: ConfigService) => {
				const { host, port, secure, user, password, from } = readMailConfig(configService);
				const retry = { ...MAIL_RETRY, retryIf: logRetries(logger) };
				if (!host) return { transport: new LogMailTransport(), from, retry };

				const tls = secure ? 'implicit TLS' : `STARTTLS ${LOOPBACK.test(host) ? 'opportunistic' : 'required'}`;
				logger.log(
					`Mail via SMTP ${host}:${port} (${tls}), ${user ? `auth ${user}` : 'no auth'}, pool on, from "${from.name}" <${from.address}>`,
				);
				return {
					transport: new SmtpTransport({
						host,
						port,
						secure,
						pool: true,
						...(user && { auth: { user, pass: password ?? '' } }),
					}),
					from,
					retry,
				};
			},
		}),
	],
	providers: [MailService, StrictTemplateEngine],
	exports: [MailService],
})
export class MailModule implements OnModuleInit {
	public constructor(private readonly mailEvents: MailEvents) {}

	public onModuleInit() {
		this.mailEvents.events$.subscribe((event) => {
			if (event.type !== 'failed') return;
			if (event.error instanceof Error) loggedMailErrors.add(event.error);
			logMailFailure(
				logger,
				`Failed to send email to ${event.recipients.join(', ')} "${event.subject}" after ${event.attempts} attempt(s) in ${event.durationMs}ms`,
				event.error,
			);
		});
	}
}
