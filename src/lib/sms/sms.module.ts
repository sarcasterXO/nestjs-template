import { Global, Module } from '@nestjs/common';

import { SmsProvider } from './sms.provider';
import { UnifonicSmsProvider } from './unifonic.provider';

@Global()
@Module({
	providers: [{ provide: SmsProvider, useClass: UnifonicSmsProvider }],
	exports: [SmsProvider],
})
export class SmsModule {}
