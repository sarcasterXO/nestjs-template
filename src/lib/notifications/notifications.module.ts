import { Global, Module } from '@nestjs/common';

import { NotificationsService } from './notifications.service';
import { PushNotificationService } from './push-notification.service';

@Global()
@Module({
	providers: [NotificationsService, PushNotificationService],
	exports: [NotificationsService, PushNotificationService],
})
export class NotificationsModule {}
