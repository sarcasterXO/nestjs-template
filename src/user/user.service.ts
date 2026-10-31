import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';

import { MongoUserService, MongoAuditLogService, MongoNotificationService } from '../lib/mongo';
import { NotificationsService } from '../lib/notifications';
import { S3BaseService, S3FolderPaths, type AttachmentInput } from '../lib/s3';
import { diffObjects } from '../lib/util/Diff';
import { permissionsFor } from '../lib/util/Permissions';
import { escapeRegex } from '../lib/util/Regex';
import { setOrUnset } from '../lib/util/Util';
import { assertXlsxExportSize, MAX_XLSX_EXPORT_ROWS } from '../lib/util/Xlsx';

import type { IUserZodSchema } from '../lib/mongo/zod';
import type { UpdateMeDto, UpdateUserDto } from './user.request.dto';
import type { QueryFilter, SortOrder } from 'mongoose';

@Injectable()
export class UserService extends S3BaseService {
	public constructor(
		private readonly mongoUserService: MongoUserService,
		private readonly mongoNotificationService: MongoNotificationService,
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

	public async getMe(user: IUserZodSchema) {
		const [populated] = await this.populateUsers([user]);
		return populated;
	}

	public async getAllUsers(query: { limit?: number; page?: number; sort?: Record<string, SortOrder>; name?: string }) {
		const { data, total } = await this.mongoUserService.paginate(this.listFilter(query.name), query);
		return { data: await this.populateUsers(data), total };
	}

	public async exportUsers(query: { sort?: Record<string, SortOrder>; name?: string }) {
		const filter = this.listFilter(query.name);
		// Counted first, so an oversized export is refused before any rows are loaded.
		assertXlsxExportSize(await this.mongoUserService.count(filter));
		// Only the columns the sheet writes, since up to MAX_XLSX_EXPORT_ROWS documents are held in memory.
		return this.mongoUserService.find(filter, ['name', 'email', 'lastLoginAt', 'role', 'superAdmin', 'createdAt'], {
			limit: MAX_XLSX_EXPORT_ROWS,
			sort: query.sort,
		});
	}

	public async updateUser(
		existingUser: IUserZodSchema,
		updateData: Partial<UpdateUserDto>,
		updatedBy?: Pick<IUserZodSchema, 'id' | 'name'>,
	) {
		const { id } = existingUser;
		if (updateData.email && updateData.email !== existingUser.email) await this.assertEmailAvailable(updateData.email);

		const updatedUser = await this.saveChanges(existingUser, updateData, {
			name: updateData.name,
			email: updateData.email ?? undefined,
			role: updateData.role,
			status: updateData.status,
			phone: updateData.phone,
			// An inactive account is logged out and stops receiving push notifications.
			...(updateData.status !== undefined && updateData.status !== 'Accepted'
				? { sessions: [], subscriptions: [] }
				: {}),
		});

		if (updatedBy) {
			void this.audit({
				user: updatedBy,
				action: 'user updated',
				message: `User Updated: "${existingUser.name}" (ID: ${id})`,
				documentId: id,
				changes: diffObjects(existingUser, updatedUser),
			});
		}

		return updatedUser;
	}

	public async updateMe(existingUser: IUserZodSchema, updateData: UpdateMeDto) {
		const email = updateData.email === existingUser.email ? undefined : updateData.email;
		if (email) {
			await this.verifyPassword(existingUser.id, updateData.currentPassword ?? '');
			await this.assertEmailAvailable(email);
		}

		const updatedUser = await this.saveChanges(existingUser, updateData, {
			name: updateData.name,
			email,
			phone: updateData.phone,
		});

		void this.audit({
			user: { id: existingUser.id, name: existingUser.name },
			action: 'user updated',
			message: `User Updated (self): "${existingUser.name}" (ID: ${existingUser.id})`,
			documentId: existingUser.id,
			changes: diffObjects(existingUser, updatedUser),
		});

		return updatedUser;
	}

	public async deleteUser(user: Pick<IUserZodSchema, 'id' | 'name'>, deletedBy: Pick<IUserZodSchema, 'id' | 'name'>) {
		// The avatar is unset with the delete, since its file is removed below.
		await this.mongoUserService.updateOne(
			{ id: user.id },
			{ $set: { deleted: true, sessions: [], subscriptions: [] }, $unset: { avatarUrl: 1 } },
		);
		// Files and notifications go only once the account is deleted, and a failed cleanup is logged rather than undoing the delete.
		try {
			await this.deleteS3Directory(`${user.id}/`);
		} catch (error) {
			this.logger.error(
				`Failed to delete files of user ${user.id}: ${error instanceof Error ? error.stack : String(error)}`,
			);
		}
		try {
			await this.mongoNotificationService.deleteMany({ userId: user.id });
		} catch (error) {
			this.logger.error(
				`Failed to delete notifications of user ${user.id}: ${error instanceof Error ? error.stack : String(error)}`,
			);
		}

		void this.audit({
			user: deletedBy,
			action: 'user deleted',
			message: `User Deleted: "${user.name}" (ID: ${user.id})`,
			documentId: user.id,
		});
	}

	public async sendNotificationToUser(userId: string, message: string) {
		await this.notificationsService.notifyUser(userId, { title: 'Notification', body: message });
	}

	/** Fire-and-forget: the change is already saved, so a failed write is logged rather than failing the request. */
	private async audit(entry: Parameters<MongoAuditLogService['create']>[0]) {
		try {
			await this.auditService.create(entry);
		} catch (error) {
			this.logger.error(`Failed to write audit log "${entry.message}"`, error);
		}
	}

	/** Deleted accounts keep their email reserved, so they count as taken too. */
	private async assertEmailAvailable(email: string) {
		if (await this.mongoUserService.exists({ email })) throw new BadRequestException('Email already registered.');
	}

	private async verifyPassword(userId: string, password: string) {
		const user = await this.mongoUserService.findOne({ id: userId }, ['+password']);
		if (!user || !(await argon2.verify(user.password, password))) {
			throw new BadRequestException('Current password is incorrect.');
		}
	}

	/** Prefix matches, so they can use the `name` and `email` indexes. Emails are stored lowercase. */
	private listFilter(name?: string): QueryFilter<IUserZodSchema> {
		if (!name) return { deleted: { $ne: true } };
		return {
			deleted: { $ne: true },
			$or: [
				{ name: { $regex: `^${escapeRegex(name)}`, $options: 'i' } },
				{ email: { $regex: `^${escapeRegex(name.toLowerCase())}` } },
			],
		};
	}

	// Add any extra per-user data the GET endpoints should return here.
	private async populateUsers(users: IUserZodSchema[]) {
		return users.map((user) => ({ ...user, permissions: [...permissionsFor(user)] }));
	}

	/**
	 * Applies a PATCH. A new avatar is uploaded before the update, but the replaced one is only deleted once the
	 * update is saved, so a failed update never leaves the user pointing at a deleted file.
	 */
	private async saveChanges<T extends object>(
		existingUser: IUserZodSchema,
		updateData: { avatarUrl?: AttachmentInput | null },
		changes: T,
	) {
		const { id } = existingUser;
		const avatarChanged = 'avatarUrl' in updateData;
		const avatarUrl = avatarChanged
			? await this.uploadAvatar(id, updateData.avatarUrl, existingUser.avatarUrl)
			: undefined;

		const updatedUser = await this.mongoUserService.updateOne(
			{ id },
			setOrUnset(avatarChanged ? { ...changes, avatarUrl } : changes),
		);
		if (!updatedUser) throw new NotFoundException('User not found');

		if (avatarChanged && existingUser.avatarUrl) {
			await this.deleteRemovedAttachments([existingUser.avatarUrl], avatarUrl ? [avatarUrl] : [], id);
		}
		return updatedUser;
	}

	private async uploadAvatar(userId: string, avatar: AttachmentInput | null | undefined, oldUrl?: string | null) {
		if (typeof avatar === 'string' && avatar !== oldUrl && !this.isOwnS3Url(avatar, userId)) {
			throw new BadRequestException('Avatar must be uploaded as a file or be the current avatar URL.');
		}
		return avatar ? this.processAttachment(avatar, userId) : null;
	}
}
