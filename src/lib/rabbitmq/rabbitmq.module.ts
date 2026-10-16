import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { type DynamicModule, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { DELAYED_NOTI_QUEUE_NAME } from './constants';
import { DelayedNotificationConsumer } from './delayed-notification.consumer';
import { RabbitMQService } from './rabbitmq.service';

const logger = new Logger('RabbitMQ');

@Module({})
export class CommonRabbitMQModule {
	static forRootAsync(): DynamicModule {
		return {
			module: CommonRabbitMQModule,
			imports: [
				ConfigModule,
				RabbitMQModule.forRootAsync({
					imports: [ConfigModule],
					inject: [ConfigService],
					useFactory: (configService: ConfigService) => ({
						exchanges: [
							{
								name: DELAYED_NOTI_QUEUE_NAME,
								type: 'x-delayed-message',
								options: {
									arguments: { 'x-delayed-type': 'direct' },
									durable: true,
								},
								createExchangeIfNotExists: true,
							},
						],
						queues: [
							{
								name: DELAYED_NOTI_QUEUE_NAME,
								options: {
									durable: true,
									arguments: {
										'x-delayed-type': 'direct',
									},
								},
								createQueueIfNotExists: true,
								exchange: DELAYED_NOTI_QUEUE_NAME,
								routingKey: ['delayed-message'],
							},
						],
						uri: configService.getOrThrow('RMQ_URI'),
						connectionInitOptions: {
							wait: false,
							reject: true,
							timeout: 9_000,
						},
						logger,
						prefetchCount: 1,
					}),
				}),
			],
			exports: [RabbitMQModule, RabbitMQService],
			providers: [RabbitMQService, DelayedNotificationConsumer],
			global: true,
		};
	}
}
