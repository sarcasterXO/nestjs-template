import { RabbitSubscribe, RabbitPayload } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger } from '@nestjs/common';

import { DELAYED_NOTI_QUEUE_NAME, DelayedNotificationHandlers, type DelayedNotificationArgs } from './constants';

interface DelayedMessage<T extends DelayedNotificationHandlers> {
	handler: T;
	data: DelayedNotificationArgs[T];
}

@Injectable()
export class DelayedNotificationConsumer {
	private readonly logger = new Logger(DelayedNotificationConsumer.name);

	@RabbitSubscribe({
		exchange: DELAYED_NOTI_QUEUE_NAME,
		routingKey: 'delayed-message',
		queue: DELAYED_NOTI_QUEUE_NAME,
	})
	public async handleDelayedNotification(
		@RabbitPayload()
		message: DelayedMessage<DelayedNotificationHandlers.DELAYED_NOTIFICATION>,
	) {
		this.logger.log(`Received delayed notification: ${message.handler}`);

		try {
			this.logger.log(`Processing delayed notification for user: ${message.data.userId}`);
		} catch (error) {
			this.logger.error(`Error handling delayed notification: ${message.handler}`, error);
			throw error;
		}
	}
}
