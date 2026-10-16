import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { DB_CONNECTION_NAME } from '../../util/Constants';
import { MongoBaseService } from '../MongoBaseService';
import { NotificationSchemaName } from '../schemas/notification.schema';

import type { INotificationZodSchema, INotificationZodSchemaInput } from '../zod';

@Injectable()
export class MongoNotificationService extends MongoBaseService<INotificationZodSchemaInput, INotificationZodSchema> {
	public constructor(
		@InjectModel(NotificationSchemaName, DB_CONNECTION_NAME)
		public readonly model: Model<INotificationZodSchemaInput, INotificationZodSchema>,
	) {
		super();
	}
}
