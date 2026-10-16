import process from 'node:process';

import helmet from '@fastify/helmet';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { ZodValidationPipe, standardSchemaConverter } from '#zod';

import { AppModule } from './app.module';
import { PAGINATION_HEADERS } from './lib/util/Pagination';

const envService = new ConfigService();
const logger = new Logger();

const CORS_ORIGINS: (RegExp | string)[] = [/^http:\/\/localhost:\d+$/];

async function bootstrap() {
	logger.log('Starting Web API...');
	const app = await NestFactory.create<NestFastifyApplication>(
		AppModule,
		new FastifyAdapter({
			bodyLimit: 50 * 1_024 * 1_024,
			// Trust X-Forwarded-* only from a reverse proxy on loopback or a private network (e.g. Docker).
			trustProxy: 'loopback,uniquelocal',
		}),
		{
			cors: {
				origin: CORS_ORIGINS,
				methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
				allowedHeaders: ['Content-Type', 'Authorization', 'x-request-origin'],
				exposedHeaders: [...Object.keys(PAGINATION_HEADERS), 'Content-Disposition'],
			},
		},
	);
	await app.register(helmet);
	app.useGlobalPipes(new ZodValidationPipe());

	const PORT = envService.getOrThrow('PORT');

	const swaggerEnabled = process.env.NODE_ENV === 'development' && envService.get('DISABLE_SWAGGER') !== 'true';
	if (swaggerEnabled) {
		const config = new DocumentBuilder()
			.setTitle('NestJS Template API')
			.setDescription('Auth, users, audit logging, notifications, mail, S3 and MongoDB — batteries included')
			.setVersion('1.0')
			.build();

		const document = SwaggerModule.createDocument(app, config, { standardSchemaConverter });
		SwaggerModule.setup('docs', app, document);
	}

	await app.listen(PORT, '0.0.0.0');
	logger.log(`Application is listening on http://localhost:${PORT}`);
	if (swaggerEnabled) logger.log(`Swagger is running on http://localhost:${PORT}/docs`);
}

await bootstrap();
