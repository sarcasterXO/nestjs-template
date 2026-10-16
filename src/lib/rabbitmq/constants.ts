import process from 'node:process';

import type { INotificationZodSchema } from '../mongo/zod';

export const DELAYED_NOTI_QUEUE_NAME = 'delayed_' + process.env.RMQ_QUEUE_NAME;
export const RMQ_NOTI_QUEUE_NAME = process.env.RMQ_QUEUE_NAME;

export enum DelayedNotificationHandlers {
	DELAYED_NOTIFICATION = 'delayed_notification',
}

export interface DelayedNotificationArgs {
	[DelayedNotificationHandlers.DELAYED_NOTIFICATION]: INotificationZodSchema;
}
