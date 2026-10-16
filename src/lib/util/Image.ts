import { Buffer } from 'node:buffer';

import convert from 'heic-convert';
import sharp from 'sharp';
import { request } from 'undici';

/**
 * Fetches a buffer from a URL. If the URL is a local file and allowFS is true, it will read the file.
 * We use this to fetch buffer first then pass it to loadImage. This is because loadImage uses http/https
 * to fetch the image, which is slow. This is faster.
 *
 * @example
 * ```ts
 * const buffer = await fetchBuffer('https://example.com/image.png');
 * const image = await loadImage(buffer);
 * ```
 */
export const fetchBuffer = async (input: string | Buffer): Promise<Buffer | null> => {
	try {
		if (!input) return null;
		if (Buffer.isBuffer(input)) return input;
		if (typeof input === 'string' && input.startsWith('http')) {
			const res = await request(input);
			if (res.statusCode < 200 || res.statusCode >= 300) return null;
			const arrBuffer = await res.body.arrayBuffer();
			return Buffer.from(arrBuffer);
		}
		return null;
	} catch (error) {
		console.error(error);
		return null;
	}
};

const convertHeicToJpeg = async (buffer: Buffer, quality: number): Promise<Buffer> =>
	Buffer.from(
		await convert({
			buffer: new Uint8Array(buffer),
			format: 'JPEG',
			quality,
		}),
	);

const convertWithSharp = async (buffer: Buffer, to: 'jpeg' | 'png' | 'webp', quality: number): Promise<Buffer> => {
	const image = sharp(buffer);
	switch (to) {
		case 'webp':
			return Buffer.from(await image.webp({ quality }).toBuffer());
		case 'png':
			return Buffer.from(await image.png().toBuffer());
		default:
			return Buffer.from(await image.jpeg({ quality }).toBuffer());
	}
};

export const convertImageType = async (
	buffer: Buffer,
	type: 'jpeg' | 'png' | 'webp' | 'heic' | 'jpg',
	to: 'jpeg' | 'png' | 'webp',
	quality = 1,
) => {
	if (type === 'heic') {
		const jpegBuffer = await convertHeicToJpeg(buffer, quality);
		if (to === 'jpeg') {
			return jpegBuffer;
		}
		return convertWithSharp(jpegBuffer, to, quality);
	}
	return convertWithSharp(buffer, to, quality);
};
