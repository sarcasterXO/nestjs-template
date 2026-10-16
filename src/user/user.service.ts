import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { MongoUserService, MongoAuditLogService } from '../lib/mongo';
import { NotificationsService } from '../lib/notifications';
import { S3BaseService, S3FolderPaths, type AttachmentInput } from '../lib/s3';
import { diffObjects } from '../lib/util/Diff';
import { escapeRegex } from '../lib/util/Regex';

import type { IUserZodSchema } from '../lib/mongo/zod';
import type { UpdateMeDto, UpdateUserDto } from './user.request.dto';
import type { QueryFilter, SortOrder } from 'mongoose';

@Injectable()
export class UserService extends S3BaseService {
	public constructor(
		private readonly mongoUserService: MongoUserService,
		private readonly auditService: MongoAuditLogService,
		private readonly notificationsService: NotificationsService,
	) {
		super(S3FolderPaths.users);
	}

	public async findUserById(id: string) {
		const user = await this.mongoUserService.findOne({ id, deleted: { $ne: true } });
		if (!user) {
			throw new NotFoundException('User not found');
		}
		return user;
	}

	public async getAllUsers(query: {
		limit?: number;
		page?: number;
		sort?: Record<string, SortOrder>;
		name?: string;
	}): Promise<{ data: IUserZodSchema[]; total: number }> {
		const nameRegex = query.name ? { $regex: escapeRegex(query.name), $options: 'i' } : undefined;

		const filter: QueryFilter<IUserZodSchema> = {
			deleted: { $ne: true },
			...(nameRegex ? { $or: [{ name: nameRegex }, { email: nameRegex }] } : {}),
		};
		return this.mongoUserService.paginate(filter, query);
	}

	public async exportUsers(query: { sort?: Record<string, SortOrder> }): Promise<IUserZodSchema[]> {
		const { data } = await this.getAllUsers(query);
		return data;
	}

	public async updateUser(
		id: string,
		updateData: Partial<UpdateUserDto>,
		updatedBy?: Pick<IUserZodSchema, 'id' | 'name'>,
	) {
		const existingUser = await this.mongoUserService.findOne({ id });
		if (!existingUser) {
			throw new NotFoundException('User not found');
		}

		if (updateData.email && updateData.email !== existingUser.email) {
			const conflict = await this.mongoUserService.findOne({ email: updateData.email });
			if (conflict && conflict.id !== id) {
				throw new BadRequestException('Email already registered.');
			}
		}

		const processedData: Partial<IUserZodSchema> = {};
		if (updateData.name !== undefined) processedData.name = updateData.name;
		if (updateData.email !== undefined && updateData.email !== null) processedData.email = updateData.email;
		if (updateData.role !== undefined) processedData.role = updateData.role;
		if (updateData.status !== undefined) {
			processedData.status = updateData.status;
			if (updateData.status !== 'Accepted') processedData.sessions = [];
		}

		if ('avatarUrl' in updateData) {
			processedData.avatarUrl = await this.updateAvatar(id, updateData.avatarUrl, existingUser.avatarUrl);
		}

		const updatedUser = await this.mongoUserService.updateOne({ id }, processedData);
		if (!updatedUser) {
			throw new NotFoundException('User not found');
		}

		if (updatedBy) {
			await this.auditService.create({
				user: updatedBy,
				action: 'user updated',
				message: `User Updated: "${existingUser.name}" (ID: ${id})`,
				documentId: id,
				changes: diffObjects(existingUser, updatedUser),
			});
		}

		return updatedUser;
	}

	public async updateMe(userId: string, updateData: UpdateMeDto) {
		const existingUser = await this.mongoUserService.findOne({ id: userId });
		if (!existingUser) {
			throw new NotFoundException('User not found');
		}

		const processedData: Partial<IUserZodSchema> = {};
		if (updateData.name !== undefined) processedData.name = updateData.name;

		if ('avatarUrl' in updateData) {
			processedData.avatarUrl = await this.updateAvatar(userId, updateData.avatarUrl, existingUser.avatarUrl);
		}

		const updatedUser = await this.mongoUserService.updateOne({ id: userId }, processedData);
		if (!updatedUser) {
			throw new NotFoundException('User not found');
		}

		await this.auditService.create({
			user: { id: userId, name: existingUser.name },
			action: 'user updated',
			message: `User Updated (self): "${existingUser.name}" (ID: ${userId})`,
			documentId: userId,
			changes: diffObjects(existingUser, updatedUser),
		});

		return updatedUser;
	}

	public async deleteUser(userId: string, deletedBy: Pick<IUserZodSchema, 'id' | 'name'>) {
		const user = await this.mongoUserService.findOne({ id: userId });
		if (!user) throw new NotFoundException('User not found');

		await this.deleteS3Directory(`${userId}/`);
		await this.mongoUserService.updateOne({ id: userId }, { deleted: true, sessions: [], subscriptions: [] });

		await this.auditService.create({
			user: deletedBy,
			action: 'user deleted',
			message: `User Deleted: "${user.name}" (ID: ${userId})`,
			documentId: userId,
		});
	}

	public async sendNotificationToUser(userId: string, message: string) {
		await this.notificationsService.notifyUser(userId, { title: 'Notification', body: message });
	}

	private async updateAvatar(userId: string, avatar: AttachmentInput | null | undefined, oldUrl?: string | null) {
		const avatarUrl = avatar ? await this.processAttachment(avatar, userId) : null;
		if (oldUrl) await this.deleteRemovedAttachments([oldUrl], avatarUrl ? [avatarUrl] : [], userId);
		return avatarUrl;
	}
}
