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
					useFactory: (configService: ConfigService) => {
						// The queue and exchange names are built from it at import time, so without it they'd be `delayed_undefined`.
						if (!configService.get<string>('RMQ_QUEUE_NAME')) {
							throw new Error('RMQ_QUEUE_NAME must be set when RMQ_URI is set');
						}
						return {
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
									options: { durable: true },
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
						};
					},
				}),
			],
			exports: [RabbitMQModule, RabbitMQService],
			providers: [RabbitMQService, DelayedNotificationConsumer],
			global: true,
		};
	}
}
