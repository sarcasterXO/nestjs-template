import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { HealthController } from './health.controller';

@Module({
	imports: [TerminusModule.forRoot({ gracefulShutdownTimeoutMs: 5_000 })],
	controllers: [HealthController],
})
export class HealthModule {}
