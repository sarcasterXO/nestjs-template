import { z } from 'zod';

export const attachmentCreateSchema = z.object({
	buffer: z.string().describe('Base64 encoded file content (supports images, PDFs, videos, and office documents)'),
	name: z
		.string()
		.describe(
			'Original filename with extension (e.g., document.pdf, video.mp4, report.docx, presentation.pptx, image.jpg)',
		),
});

export const attachmentUpdateSchema = attachmentCreateSchema.or(z.url().describe('Existing URL'));

export const attachmentInputSchema = attachmentUpdateSchema;
