import { Body, Controller, Headers, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import {
	type ChangePasswordDto,
	ChangePasswordDtoSchema,
	type LoginDto,
	LoginDtoSchema,
	type RefreshDto,
	RefreshDtoSchema,
	type RegisterDto,
	RegisterDtoSchema,
} from './auth.request.dto';
import { AuthService } from './auth.service';

import { Auth } from '../lib/decorators/auth.decorator';
import { Swagger } from '../lib/decorators/swagger.decorator';
import { User } from '../lib/decorators/user.decorator';
import { RateLimitGuard } from '../lib/guard/rateLimitGuard.guard';
import {
	type APIAuthUserDto,
	APIAuthUserDtoSchema,
	type ChangePasswordResponseDto,
	ChangePasswordResponseDtoSchema,
	type LogoutDto,
	LogoutDtoSchema,
	type RegisterResponseDto,
	RegisterResponseDtoSchema,
} from '../user/user.response.dto';

import type { IUserZodSchema } from '../lib/mongo/zod';
import type { FastifyRequest } from 'fastify';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
	public constructor(private readonly authService: AuthService) {}

	// ==================== POST ROUTES ====================

	@Swagger('Register a new account (requires admin approval)', RegisterResponseDtoSchema)
	@UseGuards(new RateLimitGuard(5, 5 / 60))
	@Post('register')
	public async register(
		@Body({ schema: RegisterDtoSchema }) body: RegisterDto,
		@Req() req: FastifyRequest,
	): Promise<RegisterResponseDto> {
		const { ip } = req;
		return this.authService.register(body, ip);
	}

	@Swagger('Login with email and password', APIAuthUserDtoSchema)
	@UseGuards(new RateLimitGuard(10, 10 / 60))
	@Post('login')
	public async login(
		@Body({ schema: LoginDtoSchema }) body: LoginDto,
		@Headers('user-agent') userAgent?: string,
	): Promise<APIAuthUserDto> {
		return this.authService.login(body, userAgent);
	}

	@Swagger('Refresh the access token', APIAuthUserDtoSchema)
	@UseGuards(new RateLimitGuard(10, 10 / 60))
	@Post('refresh')
	public async refreshToken(@Body({ schema: RefreshDtoSchema }) body: RefreshDto): Promise<APIAuthUserDto> {
		return this.authService.refresh(body.refreshToken);
	}

	@Swagger('Logout user', LogoutDtoSchema)
	@UseGuards(new RateLimitGuard(10, 10 / 60))
	@Auth()
	@Post('logout')
	public async logout(
		@User() user: IUserZodSchema,
		@Headers('authorization') authorization: string,
	): Promise<LogoutDto> {
		return this.authService.logout(user, authorization.slice('Bearer '.length));
	}

	// ==================== PATCH ROUTES ====================

	@Swagger('Change my password', ChangePasswordResponseDtoSchema)
	@UseGuards(new RateLimitGuard(5, 5 / 60))
	@Auth()
	@Patch('password')
	public async changePassword(
		@Body({ schema: ChangePasswordDtoSchema }) body: ChangePasswordDto,
		@User() user: IUserZodSchema,
	): Promise<ChangePasswordResponseDto> {
		return this.authService.changePassword(user.id, body);
	}
}
