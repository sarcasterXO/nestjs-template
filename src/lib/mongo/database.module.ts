import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { STATES } from 'mongoose';

import { MongoAuditLogService } from './audit-log/audit-log.service';
import { MongoNotificationService } from './notification/notification.service';
import { AuditLogSchema, AuditLogSchemaName } from './schemas/audit-log.schema';
import { NotificationSchema, NotificationSchemaName } from './schemas/notification.schema';
import { UserSchema, UserSchemaName } from './schemas/user.schema';
import { MongoUserService } from './user/user.service';

import { DB_CONNECTION_NAME } from '../util/Constants';

import type { Connection } from 'mongoose';

const logger = new Logger('DatabaseModule');

const SCHEMA_REGISTRATIONS = MongooseModule.forFeature(
	[
		{ name: AuditLogSchemaName, schema: AuditLogSchema },
		{ name: NotificationSchemaName, schema: NotificationSchema },
		{ name: UserSchemaName, schema: UserSchema },
	],
	DB_CONNECTION_NAME,
);

const DB_SERVICES = [MongoAuditLogService, MongoNotificationService, MongoUserService];

@Global()
@Module({
	imports: [
		MongooseModule.forRootAsync({
			connectionName: DB_CONNECTION_NAME,
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => ({
				uri: configService.getOrThrow<string>('DB_URI'),
				dbName: DB_CONNECTION_NAME,
				connectionFactory: (connection: Connection) => {
					connection.on('connected', () => {
						logger.log('DB connected');
					});
					connection.on('disconnected', () => {
						logger.log('DB disconnected');
					});
					connection.on('error', (error) => {
						logger.log(`DB connection failed! Error: ${error}`);
					});

					logger.log(`DB ${STATES[connection.readyState]}`);
					return connection;
				},
				maxPoolSize: 50,
				minPoolSize: 1,
				connectTimeoutMS: 10_000,
				socketTimeoutMS: 30_000 * 5,
				family: 4,
				serverSelectionTimeoutMS: 10_000,
				maxIdleTimeMS: 30_000 * 5,
			}),
		}),
		SCHEMA_REGISTRATIONS,
	],
	providers: DB_SERVICES,
	exports: [...DB_SERVICES, SCHEMA_REGISTRATIONS],
})
export class DatabaseModule {}
