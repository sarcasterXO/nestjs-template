import { StandardSchemaValidationPipe, UnprocessableEntityException } from '@nestjs/common';

export class ZodValidationPipe extends StandardSchemaValidationPipe {
	public constructor() {
		super();
		this.exceptionFactory = (issues) =>
			new UnprocessableEntityException(`Input validation failed: ${this.formatIssueMessages(issues).join(', ')}`);
	}
}
