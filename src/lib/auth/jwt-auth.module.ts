import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { AuthGuard } from '../guard/auth.guard';

@Module({
	imports: [
		JwtModule.registerAsync({
			global: true,
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => ({
				secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
				signOptions: { expiresIn: '6h' },
			}),
		}),
	],
	providers: [AuthGuard],
	exports: [AuthGuard],
})
export class JwtAuthModule {}
