import { Buffer } from 'node:buffer';
import process from 'node:process';

import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { InternalServerErrorException, Logger } from '@nestjs/common';
import { lookup } from 'mime-types';

import { formatFolderPath, type S3FolderPath } from './s3-folder-paths';
import { s3KeyToPublicPath, s3UrlToKey, withAttachmentUrlVersion } from './s3-url.util';

import { convertImageType } from '../util/Image';
import { IMAGE_EXTENSIONS } from '../util/Regex';

import type { attachmentUpdateSchema } from '../dtos/attachment.dto';
import type { z } from 'zod';

export type AttachmentInput = z.infer<typeof attachmentUpdateSchema>;

const MAX_ATTACHMENT_BASENAME_LENGTH = 30;
const bucketName = process.env.S3_NAME;
const envPrefix = process.env.DEPLOYED_ENVIRONMENT === 'development' ? 'development/' : '';

const s3 = new S3Client({
	region: process.env.AWS_REGION,
	credentials: {
		accessKeyId: process.env.ACCESS_KEY_ID,
		secretAccessKey: process.env.SECRET_ACCESS_KEY,
	},
	// No default timeout: an unreachable endpoint would hang the request forever.
	requestHandler: { connectionTimeout: 5_000, requestTimeout: 30_000, throwOnRequestTimeout: true },
});

function normalizeAttachmentName(name: string) {
	const trimmed = name.trim().replaceAll(/[/\\]/g, '-');
	const dotIndex = trimmed.lastIndexOf('.');
	if (dotIndex <= 0) return trimmed.slice(0, MAX_ATTACHMENT_BASENAME_LENGTH);
	return `${trimmed.slice(0, Math.min(dotIndex, MAX_ATTACHMENT_BASENAME_LENGTH))}${trimmed.slice(dotIndex)}`;
}

/**
 * Base service for S3 operations. Extend it and pass the entity's top-level folder to `super()`.
 */
export class S3BaseService {
	protected readonly logger = new Logger(S3BaseService.name);
	protected readonly defaultFolderPath: string;

	public constructor(defaultFolderPath: S3FolderPath = '') {
		this.defaultFolderPath = formatFolderPath(defaultFolderPath);
	}

	public buildS3Key(key: string, folderPath?: S3FolderPath) {
		const folder = folderPath ? formatFolderPath(folderPath) : this.defaultFolderPath;
		return `${envPrefix}${folder}${key}`.replaceAll(/\s+/g, '+').toLowerCase();
	}

	public buildPublicS3Url(fullKey: string) {
		return `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3KeyToPublicPath(fullKey)}`;
	}

	/**
	 * Upload a file to S3, converting images to WebP. The returned url carries a `?v=` upload timestamp.
	 */
	public async uploadToS3(key: string, body: Buffer, folderPath?: S3FolderPath) {
		let fullKey = this.buildS3Key(key, folderPath);

		const imageType = IMAGE_EXTENSIONS.find((ext) => fullKey.endsWith(`.${ext}`));
		if (imageType && imageType !== 'webp') {
			body = await convertImageType(body, imageType, 'webp', 99);
			fullKey = fullKey.replace(/\.[^.]+$/, '.webp');
		}

		await s3.send(
			new PutObjectCommand({
				Bucket: bucketName,
				Key: fullKey,
				Body: body,
				ContentType: lookup(fullKey) || 'application/octet-stream',
			}),
		);

		return { key: fullKey, url: withAttachmentUrlVersion(this.buildPublicS3Url(fullKey), Date.now()) };
	}

	/**
	 * Delete every object under a prefix, e.g. all attachments of one entity
	 */
	public async deleteS3Directory(prefix: string, folderPath?: S3FolderPath) {
		const { Contents = [] } = await s3.send(
			new ListObjectsV2Command({ Bucket: bucketName, Prefix: this.buildS3Key(prefix, folderPath) }),
		);
		const keys = Contents.flatMap(({ Key }) => (Key ? [{ Key }] : []));
		if (!keys.length) return;

		await s3.send(new DeleteObjectsCommand({ Bucket: bucketName, Delete: { Objects: keys } }));
	}

	/**
	 * Upload a new attachment, or pass an existing url through unchanged
	 */
	public async processAttachment(attachment: AttachmentInput, key: string, folderPath?: S3FolderPath) {
		if (typeof attachment === 'string') return attachment;

		try {
			const body = Buffer.from(attachment.buffer.replace(/^data:[^;]+;base64,/, ''), 'base64');
			const { url } = await this.uploadToS3(`${key}/${normalizeAttachmentName(attachment.name)}`, body, folderPath);
			return url;
		} catch (error) {
			this.logger.error(`Failed to upload attachment: ${error instanceof Error ? error.stack : String(error)}`);
			throw new InternalServerErrorException('Failed to upload attachment', { cause: error });
		}
	}

	public async processAttachments(attachments: AttachmentInput[], key: string, folderPath?: S3FolderPath) {
		return Promise.all(
			attachments.map(async (attachment, index) => this.processAttachment(attachment, `${key}/${index}`, folderPath)),
		);
	}

	/**
	 * Upload the new attachments, then delete the old files that are no longer referenced
	 */
	public async updateAttachments(
		attachments: AttachmentInput[],
		oldUrls: string[],
		key: string,
		folderPath?: S3FolderPath,
	) {
		const urls = await this.processAttachments(attachments, key, folderPath);
		await this.deleteRemovedAttachments(oldUrls, urls, key, folderPath);
		return urls;
	}

	/**
	 * Compares by object key, so a re-uploaded file with the same name but a new `?v=` is kept.
	 * Only deletes objects under `key`, since stored urls may be client-supplied.
	 */
	public async deleteRemovedAttachments(oldUrls: string[], newUrls: string[], key: string, folderPath?: S3FolderPath) {
		const ownPrefix = this.buildS3Key(`${key}/`, folderPath);
		const keptKeys = new Set(newUrls.map(s3UrlToKey));
		const removed = oldUrls.map(s3UrlToKey).filter((oldKey) => oldKey.startsWith(ownPrefix) && !keptKeys.has(oldKey));
		if (!removed.length) return;

		try {
			await s3.send(
				new DeleteObjectsCommand({ Bucket: bucketName, Delete: { Objects: removed.map((Key) => ({ Key })) } }),
			);
		} catch (error) {
			this.logger.error(
				`Failed to delete removed attachments: ${error instanceof Error ? error.stack : String(error)}`,
			);
		}
	}
}
