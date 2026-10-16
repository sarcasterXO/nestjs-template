import { Module, type MiddlewareConsumer } from '@nestjs/common';
import { ConditionalModule, ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { AuditLogModule } from './audit-log/audit-log.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthModule } from './lib/auth/jwt-auth.module';
import { MailModule } from './lib/mail';
import { LoggerMiddleware } from './lib/middlewares/logger.middleware';
import { DatabaseModule } from './lib/mongo/database.module';
import { NotificationsModule } from './lib/notifications';
import { CommonRabbitMQModule } from './lib/rabbitmq/rabbitmq.module';
import { SmsModule } from './lib/sms';
import { ZodSerializerInterceptor } from './lib/zod';
import { NotificationModule } from './notification/notification.module';
import { PushNotificationModule } from './push-notification/push-notification.module';
import { RolesModule } from './roles/roles.module';
import { UserModule } from './user/user.module';

@Module({
	imports: [
		AuditLogModule,
		AuthModule,
		ConditionalModule.registerWhen(CommonRabbitMQModule.forRootAsync(), (env) => Boolean(env.RMQ_URI)),
		ConfigModule.forRoot({
			isGlobal: true,
			envFilePath: '.env',
		}),
		DatabaseModule,
		JwtAuthModule,
		MailModule,
		NotificationModule,
		NotificationsModule,
		PushNotificationModule,
		RolesModule,
		SmsModule,
		UserModule,
	],
	controllers: [],
	providers: [{ provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor }],
})
export class AppModule {
	public configure(consumer: MiddlewareConsumer) {
		consumer.apply(LoggerMiddleware).forRoutes('{*path}');
	}
}
