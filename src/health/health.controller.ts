import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Controller, Get, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { ApiExcludeController } from '@nestjs/swagger';
import {
	HealthCheck,
	HealthCheckService,
	HealthIndicatorService,
	type HealthIndicatorFunction,
	MemoryHealthIndicator,
	MongooseHealthIndicator,
} from '@nestjs/terminus';
import { type Connection } from 'mongoose';

import { DB_CONNECTION_NAME } from '../lib/util/Constants';

@ApiExcludeController()
@Controller('health')
export class HealthController {
	private readonly heapLimitBytes: number;

	public constructor(
		private readonly health: HealthCheckService,
		private readonly indicator: HealthIndicatorService,
		private readonly mongoose: MongooseHealthIndicator,
		private readonly memory: MemoryHealthIndicator,
		@InjectConnection(DB_CONNECTION_NAME) private readonly connection: Connection,
		configService: ConfigService,
		@Optional() private readonly amqp?: AmqpConnection,
	) {
		this.heapLimitBytes = Number(configService.get('HEALTH_HEAP_LIMIT_MB') ?? 512) * 1_024 * 1_024;
	}

	@Get()
	@HealthCheck()
	public ready() {
		const checks: HealthIndicatorFunction[] = [
			() => this.mongoose.pingCheck('mongodb', { connection: this.connection, timeout: 1_000 }),
			() => this.memory.checkHeap('memory_heap', this.heapLimitBytes),
		];
		const { amqp } = this;
		if (amqp) {
			checks.push(() => {
				const rabbitmq = this.indicator.check('rabbitmq');
				return amqp.connected ? rabbitmq.up() : rabbitmq.down();
			});
		}
		return this.health.check(checks);
	}

	@Get('live')
	@HealthCheck()
	public live() {
		return this.health.check([]);
	}
}
