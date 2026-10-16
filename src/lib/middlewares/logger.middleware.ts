import { Buffer } from 'node:buffer';

import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';

import type { FastifyReply, FastifyRequest } from 'fastify';

const LOGGED_BODY_STATUSES = new Set([400, 403, 422]);

const loggerColumnWidths = {
	method: 6,
	status: 3,
	route: 70,
	userId: 20,
	ip: 10,
	time: 15,
};

const loggerColors = {
	methods: {
		GET: '\u{1B}[94m',
		POST: '\u{1B}[92m',
		PUT: '\u{1B}[93m',
		DELETE: '\u{1B}[91m',
		PATCH: '\u{1B}[96m',
		DEFAULT: '\u{1B}[95m',
	},
	statuses: {
		success: '\u{1B}[92m',
		redirect: '\u{1B}[93m',
		clientError: '\u{1B}[91m',
		serverError: '\u{1B}[95m',
		default: '\u{1B}[97m',
	},
	reset: '\u{1B}[39m',
};

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
	private logger = new Logger('HTTP');

	public use(req: FastifyRequest & { user?: { id: string } }, res: FastifyReply['raw'], next: () => void) {
		const { method, originalUrl, ip } = req;
		if (method === 'OPTIONS') return next();
		const now = Date.now();

		let responseBody = '';
		const originalWrite = res.write;
		const originalEnd = res.end;

		res.write = function write(chunk: any, ...args: any[]) {
			if (LOGGED_BODY_STATUSES.has(res.statusCode)) responseBody += chunk instanceof Buffer ? chunk.toString() : chunk;

			return originalWrite.call(this, chunk, ...args);
		};

		res.end = function end(chunk: any, ...args: any[]) {
			if (LOGGED_BODY_STATUSES.has(res.statusCode) && chunk) {
				responseBody += chunk instanceof Buffer ? chunk.toString() : chunk;
			}

			return originalEnd.call(this, chunk, ...args);
		};

		res.on('finish', () => {
			const { statusCode } = res;
			const time = Date.now() - now;
			const userId = req.user?.id ?? '-';

			const methodColor = loggerGetMethodColor(method);
			const statusColor = loggerGetStatusColor(statusCode);
			const truncatedRoute = truncateLoggerRoute(originalUrl);

			const logMessage = [
				` | ${methodColor}${padLogger(method, loggerColumnWidths.method)}${loggerColors.reset}`,
				`${statusColor}${padLogger(statusCode, loggerColumnWidths.status)}${loggerColors.reset}`,
				padLogger(truncatedRoute, loggerColumnWidths.route),
				padLogger(userId, loggerColumnWidths.userId),
				padLogger(`${(req.headers['x-request-origin'] as string | undefined) ?? '-'} | ${ip}`, loggerColumnWidths.ip),
				padLogger(`${time}ms`, loggerColumnWidths.time),
			].join(' | ');

			this.logger.log(logMessage);

			if (responseBody) this.logger.warn(responseBody);
		});

		next();
	}
}

function padLogger(text: string | number, length: number) {
	return text.toString().padEnd(length, ' ');
}

type LoggerHttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
function loggerGetMethodColor(method: string): string {
	return loggerColors.methods[method as LoggerHttpMethod] || loggerColors.methods.DEFAULT;
}

function loggerGetStatusColor(status: number): string {
	if (status >= 200 && status < 300) return loggerColors.statuses.success;
	if (status >= 300 && status < 400) return loggerColors.statuses.redirect;
	if (status >= 400 && status < 500) return loggerColors.statuses.clientError;
	if (status >= 500) return loggerColors.statuses.serverError;
	return loggerColors.statuses.default;
}
function truncateLoggerRoute(route: string) {
	return route.length > 68 ? `${route.slice(0, 68 - 3)}...` : route;
}
