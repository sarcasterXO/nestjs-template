import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { DB_CONNECTION_NAME } from '../../util/Constants';
import { MongoBaseService } from '../MongoBaseService';
import { AuditLogSchemaName } from '../schemas/audit-log.schema';

import type { IAuditLogZodSchema, IAuditLogZodSchemaInput } from '../zod';
import type { Model } from 'mongoose';

@Injectable()
export class MongoAuditLogService extends MongoBaseService<IAuditLogZodSchemaInput, IAuditLogZodSchema> {
	public constructor(
		@InjectModel(AuditLogSchemaName, DB_CONNECTION_NAME)
		public override readonly model: Model<IAuditLogZodSchemaInput, IAuditLogZodSchema>,
	) {
		super();
	}
}
