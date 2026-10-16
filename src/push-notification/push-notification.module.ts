import { Module } from '@nestjs/common';

import { PushNotificationController } from './push-notification.controller';

@Module({
	controllers: [PushNotificationController],
})
export class PushNotificationModule {}
