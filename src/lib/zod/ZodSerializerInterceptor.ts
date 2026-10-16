import {
	Injectable,
	InternalServerErrorException,
	Logger,
	SetMetadata,
	type CallHandler,
	type ExecutionContext,
	type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, type Observable } from 'rxjs';
import { prettifyError, type ZodType } from 'zod';

const RESPONSE_SCHEMA = 'zodResponseSchema';

export const ResponseSchema = (schema: ZodType) => SetMetadata(RESPONSE_SCHEMA, schema);

/**
 * Parses each response through the route's `ResponseSchema` (set by `@Swagger()`), so fields the DTO doesn't
 * declare — `_id`, push subscriptions, anything a service spreads in — never leave the API.
 */
@Injectable()
export class ZodSerializerInterceptor implements NestInterceptor {
	private readonly logger = new Logger(ZodSerializerInterceptor.name);

	public constructor(private readonly reflector: Reflector) {}

	public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
		const schema = this.reflector.get<ZodType | undefined>(RESPONSE_SCHEMA, context.getHandler());
		if (!schema) return next.handle();

		return next.handle().pipe(
			map((body) => {
				const result = schema.safeParse(body);
				if (result.success) return result.data;

				this.logger.error(
					`${context.getClass().name}.${context.getHandler().name} response does not match its DTO:\n${prettifyError(result.error)}`,
				);
				throw new InternalServerErrorException();
			}),
		);
	}
}
