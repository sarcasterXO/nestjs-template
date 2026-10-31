import { z } from 'zod';

import { S3CommonUploadRegex, S3ImageUploadRegex } from '../util/Regex';

/** A 5 MB file is ~7 MB once base64's 4/3 overhead (and a `data:` prefix) is counted. */
const MAX_ATTACHMENT_BASE64_LENGTH = 7_000_000;

export const attachmentCreateSchema = z.object({
	buffer: z
		.string()
		.max(MAX_ATTACHMENT_BASE64_LENGTH, 'File must be 5 MB or smaller.')
		.describe('Base64 encoded file content, up to 5 MB (images, PDFs and office documents)'),
	name: z
		.string()
		.regex(S3CommonUploadRegex, 'Unsupported file type.')
		.describe('Original filename with extension (e.g., document.pdf, report.docx, sheet.xlsx, image.jpg)'),
});

const existingUrlSchema = z.url({ protocol: /^https$/ }).describe('Existing URL');

export const attachmentUpdateSchema = attachmentCreateSchema.or(existingUrlSchema);

export const attachmentInputSchema = attachmentUpdateSchema;

export const imageAttachmentUpdateSchema = attachmentCreateSchema
	.extend({
		name: z
			.string()
			.regex(S3ImageUploadRegex, 'Only jpg, jpeg, png, webp and heic images are allowed.')
			.describe('Original filename with an image extension (jpg, jpeg, png, webp or heic)'),
	})
	.or(existingUrlSchema);
