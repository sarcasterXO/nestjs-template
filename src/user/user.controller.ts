import {
	Controller,
	Get,
	Body,
	BadRequestException,
	Delete,
	ForbiddenException,
	UseGuards,
	Query,
	Param,
	Patch,
	Post,
	Res,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import {
	type ListUsersQueryDto,
	ListUsersQueryDtoSchema,
	type ExportUsersQueryDto,
	ExportUsersQueryDtoSchema,
	type UpdateUserDto,
	UpdateUserDtoSchema,
	type UpdateMeDto,
	UpdateMeDtoSchema,
	type DeleteUserDto,
	DeleteUserDtoSchema,
	type SendNotificationDto,
	SendNotificationDtoSchema,
} from './user.request.dto';
import {
	type APIAuthUserDto,
	APIAuthUserDtoSchema,
	type UserMeDto,
	UserMeDtoSchema,
	type PaginatedUsersDto,
	PaginatedUsersDtoSchema,
	type UpdateUserResponseDto,
	UpdateUserResponseDtoSchema,
} from './user.response.dto';
import { UserService } from './user.service';

import { Auth, RequirePermissions } from '../lib/decorators/auth.decorator';
import { Swagger, SwaggerPaginated } from '../lib/decorators/swagger.decorator';
import { User } from '../lib/decorators/user.decorator';
import { type SuccessDto, SuccessDtoSchema } from '../lib/dtos/response.dto';
import { RateLimitGuard } from '../lib/guard/rateLimitGuard.guard';
import { sendPaginated } from '../lib/util/Pagination';
import { PermissionLabels, Permissions, permissionsFor } from '../lib/util/Permissions';
import { parseSortQuery } from '../lib/util/Sort';
import { toXlsxBuffer, xlsxFilename, XLSX_CONTENT_TYPE } from '../lib/util/Xlsx';

import type { IUserZodSchema } from '../lib/mongo/zod';
import type { FastifyReply } from 'fastify';
import type { Buffer } from 'node:buffer';

const SORTABLE_FIELDS = ['name', 'email', 'role', 'status', 'superAdmin', 'lastLoginAt', 'createdAt', 'updatedAt'];

@ApiTags('Users')
@Controller('users')
export class UserController {
	public constructor(private readonly userService: UserService) {}

	// ==================== GET ROUTES ====================

	@Swagger('Get current user with their effective permissions', UserMeDtoSchema)
	@UseGuards(new RateLimitGuard(30, 30 / 60))
	@Auth()
	@Get('me')
	public async getCurrentUser(@User() user: IUserZodSchema): Promise<UserMeDto> {
		return this.userService.getMe(user);
	}

	@SwaggerPaginated('Get all users', PaginatedUsersDtoSchema)
	@UseGuards(new RateLimitGuard(30, 1))
	@RequirePermissions([Permissions.Users.View])
	@Get()
	public async getAllUsers(
		@Res({ passthrough: true }) reply: FastifyReply,
		@Query({ schema: ListUsersQueryDtoSchema }) query: ListUsersQueryDto,
	): Promise<PaginatedUsersDto> {
		const { sort, page, limit, ...rest } = query;
		const result = await this.userService.getAllUsers({
			...rest,
			page,
			limit,
			sort: sort ? parseSortQuery(sort, SORTABLE_FIELDS) : undefined,
		});
		return sendPaginated(reply, result, page, limit);
	}

	@ApiOperation({ summary: 'Export users matching filters as XLSX (no pagination)' })
	@UseGuards(new RateLimitGuard(10, 10 / (10 * 60)))
	@RequirePermissions([Permissions.Users.Export])
	@Get('export')
	public async exportUsersXlsx(
		@Res({ passthrough: true }) reply: FastifyReply,
		@Query({ schema: ExportUsersQueryDtoSchema }) query: ExportUsersQueryDto,
	): Promise<Buffer> {
		const { sort, ...rest } = query;
		const data = await this.userService.exportUsers({
			...rest,
			sort: sort ? parseSortQuery(sort, SORTABLE_FIELDS) : undefined,
		});

		const buffer = await toXlsxBuffer(data, [
			{ header: 'Name', value: (row) => row.name },
			{ header: 'Email', value: (row) => row.email },
			{ header: 'Last Login', value: (row) => row.lastLoginAt ?? '' },
			{ header: 'Role', value: (row) => row.role },
			{ header: 'Super Admin', value: (row) => row.superAdmin },
			{ header: 'Created At', value: (row) => row.createdAt },
		]);

		void reply.header('Content-Type', XLSX_CONTENT_TYPE);
		void reply.header('Content-Disposition', `attachment; filename="${xlsxFilename('users')}"`);
		return buffer;
	}

	// ==================== POST ROUTES ====================

	@Swagger('Send notification to a user', SuccessDtoSchema)
	@UseGuards(new RateLimitGuard(20, 20 / 60))
	@RequirePermissions([Permissions.Users.Notify])
	@ApiParam({ name: 'id', description: 'ID of the user to notify' })
	@Post(':id/send-notification')
	public async sendNotificationToUser(
		@Param('id') userId: string,
		@Body({ schema: SendNotificationDtoSchema }) body: SendNotificationDto,
	): Promise<SuccessDto> {
		await this.userService.sendNotificationToUser(userId, body.message);
		return { message: 'Notification sent', success: true };
	}

	// ==================== PATCH ROUTES ====================

	@Swagger('Update current user profile', APIAuthUserDtoSchema)
	@UseGuards(new RateLimitGuard(20, 20 / (10 * 60)))
	@Auth()
	@Patch('me')
	public async updateMe(
		@Body({ schema: UpdateMeDtoSchema }) data: UpdateMeDto,
		@User() user: IUserZodSchema,
	): Promise<APIAuthUserDto> {
		return this.userService.updateMe(user, data);
	}

	@Swagger('Update user details', UpdateUserResponseDtoSchema)
	@UseGuards(new RateLimitGuard(30, 30 / 60))
	@RequirePermissions([Permissions.Users.Update])
	@ApiParam({ name: 'id', description: 'ID of the user to update' })
	@Patch(':id')
	public async updateUser(
		@Body({ schema: UpdateUserDtoSchema }) data: UpdateUserDto,
		@User() currentUser: IUserZodSchema,
		@Param('id') userId: string,
	): Promise<UpdateUserResponseDto> {
		const targetUser = await this.userService.findUserById(userId);

		// Nobody, super admins included, changes their own role or status: /users/me only takes profile fields.
		if (targetUser.id === currentUser.id) {
			throw new BadRequestException('Cannot update your own account via admin endpoint');
		}

		if (targetUser.superAdmin && !currentUser.superAdmin) {
			throw new ForbiddenException('Only super admins can update a super admin account');
		}

		// Only Users.Manage assigns roles, so Users.Update alone can't promote an accomplice.
		if (
			data.role !== undefined &&
			data.role !== targetUser.role &&
			!permissionsFor(currentUser).has(Permissions.Users.Manage)
		) {
			throw new ForbiddenException(`Missing required permissions: ${PermissionLabels[Permissions.Users.Manage]}`);
		}

		const updatedUser = await this.userService.updateUser(targetUser, data, {
			id: currentUser.id,
			name: currentUser.name,
		});
		return { user: updatedUser, message: 'User updated successfully' };
	}

	// ==================== DELETE ROUTES ====================

	@Swagger('Delete user', SuccessDtoSchema)
	@UseGuards(new RateLimitGuard(10, 10 / 60))
	@RequirePermissions([Permissions.Users.Delete])
	@Delete()
	public async deleteUser(
		@Body({ schema: DeleteUserDtoSchema }) data: DeleteUserDto,
		@User() currentUser: IUserZodSchema,
	): Promise<SuccessDto> {
		const targetUser = await this.userService.findUserById(data.userId);

		if (targetUser.id === currentUser.id) {
			throw new BadRequestException('Cannot delete your own account');
		}

		if (targetUser.superAdmin && !currentUser.superAdmin) {
			throw new ForbiddenException('Only super admins can delete a super admin account');
		}

		await this.userService.deleteUser(targetUser, { id: currentUser.id, name: currentUser.name });
		return { message: 'User deleted successfully', success: true };
	}
}
