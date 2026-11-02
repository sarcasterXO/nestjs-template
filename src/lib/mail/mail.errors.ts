import {
	MailConnectionError,
	MailError,
	MailMessageError,
	MailRecipientsRejectedError,
	MailSmtpError,
	MailTimeoutError,
	type MailRetryOptions,
} from '@nestjs/mail';

import type { Logger } from '@nestjs/common';

export const MAIL_RETRY = { attempts: 2, backoff: { delay: '1s', maxDelay: '5s' } } satisfies MailRetryOptions;

/** Errors already logged from a `failed` event, so the facade doesn't log them again. */
export const loggedMailErrors = new WeakSet<Error>();

function describeMailError(error: unknown): string {
	if (!(error instanceof Error)) return String(error);

	const details: string[] = [];
	if (error instanceof MailRecipientsRejectedError) {
		details.push(`rejected ${error.rejected.map((r) => `${r.address} (${r.code} ${r.response})`).join(', ')}`);
	} else if (error instanceof MailSmtpError) {
		details.push(`${error.command} ${[error.code, error.enhancedCode, error.response].filter(Boolean).join(' ')}`);
	} else if (error instanceof MailTimeoutError) {
		details.push(`${error.phase} timeout after ${error.timeoutMs}ms`);
	} else if (error instanceof MailMessageError) {
		details.push(`field ${error.field}`);
	} else if (error instanceof MailConnectionError && error.cause instanceof Error && 'code' in error.cause) {
		details.push(`cause ${String(error.cause.code)}`);
	}
	if (error instanceof MailError) details.push(error.permanent ? 'permanent' : 'transient');

	return `${error.name}: ${error.message}${details.length > 0 ? ` [${details.join('; ')}]` : ''}`;
}

/** Logs at ERROR with the summary; the stack only for errors `@nestjs/mail` didn't classify. */
export function logMailFailure(logger: Logger, message: string, error: unknown) {
	const stack = error instanceof Error && !(error instanceof MailError) ? [error.stack] : [];
	logger.error(`${message}: ${describeMailError(error)}`, ...stack);
}

export function logRetries(logger: Logger, context = ''): NonNullable<MailRetryOptions['retryIf']> {
	return (error, attempt) => {
		logger.warn(
			`Mail attempt ${attempt}/${MAIL_RETRY.attempts} failed${context}, retrying: ${describeMailError(error)}`,
		);
		return true;
	};
}
