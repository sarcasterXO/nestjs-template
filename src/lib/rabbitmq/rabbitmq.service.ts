import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger } from '@nestjs/common';

import { DELAYED_NOTI_QUEUE_NAME, DelayedNotificationHandlers, type DelayedNotificationArgs } from './constants';

@Injectable()
export class RabbitMQService {
	private readonly logger = new Logger(RabbitMQService.name);

	public constructor(private readonly amqpConnection: AmqpConnection) {}

	public async publishDelayedNotification<T extends DelayedNotificationHandlers>(
		handler: T,
		data: DelayedNotificationArgs[T],
		delay: number,
	): Promise<void> {
		try {
			await this.amqpConnection.publish(
				DELAYED_NOTI_QUEUE_NAME,
				'delayed-message',
				{ handler, data },
				{
					headers: {
						'x-delay': delay,
					},
				},
			);
			this.logger.log(`Published delayed notification: ${handler} with delay: ${delay}ms`);
		} catch (error) {
			this.logger.error(`Failed to publish delayed notification: ${handler}`, error);
			throw error;
		}
	}

	public async publishImmediate<T extends DelayedNotificationHandlers>(
		handler: T,
		data: DelayedNotificationArgs[T],
	): Promise<void> {
		return this.publishDelayedNotification(handler, data, 0);
	}
}
