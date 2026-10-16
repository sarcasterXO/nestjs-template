import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { DB_CONNECTION_NAME } from '../../util/Constants';
import { MongoBaseService } from '../MongoBaseService';
import { UserSchemaName } from '../schemas/user.schema';

import type { IUserZodSchema, IUserZodSchemaInput } from '../zod/user.dto';

@Injectable()
export class MongoUserService extends MongoBaseService<IUserZodSchemaInput, IUserZodSchema> {
	public constructor(
		@InjectModel(UserSchemaName, DB_CONNECTION_NAME)
		public readonly model: Model<IUserZodSchemaInput, IUserZodSchema>,
	) {
		super();
	}
}
