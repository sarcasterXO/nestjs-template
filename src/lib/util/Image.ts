import { Buffer } from 'node:buffer';

import decodeHeic from 'heic-decode';
import sharp, { type Sharp } from 'sharp';
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

/** ~40 megapixels, enough for any phone photo; sharp's default (268 MP) lets a small file decode into gigabytes. */
const MAX_INPUT_PIXELS = 40_000_000;
/** sharp also decodes SVG, GIF, TIFF and more; uploads only ever need these (HEIC is decoded separately). */
const DECODABLE_FORMATS = new Set(['jpeg', 'png', 'webp']);

const encode = async (image: Sharp, to: 'jpeg' | 'png' | 'webp', quality: number): Promise<Buffer> => {
	switch (to) {
		case 'webp':
			return Buffer.from(await image.webp({ quality }).toBuffer());
		case 'png':
			return Buffer.from(await image.png().toBuffer());
		default:
			return Buffer.from(await image.jpeg({ quality }).toBuffer());
	}
};

/** @types/heic-decode leaves out the dimensions `all()` reads before decoding, and `dispose()`. */
type HeicImages = ({ width: number; height: number } & Awaited<ReturnType<typeof decodeHeic.all>>[number])[] & {
	dispose: () => void;
};

/**
 * Decodes the first image of a HEIC file to raw RGBA for sharp. The dimensions are checked before decoding, so an
 * oversized image is rejected before it allocates width × height × 4 bytes.
 */
const heicToSharp = async (buffer: Buffer) => {
	const images = (await decodeHeic.all({ buffer })) as HeicImages;
	try {
		const first = images.at(0);
		if (!first) throw new Error('HEIC file contains no image');
		if (first.width * first.height > MAX_INPUT_PIXELS) {
			throw new Error(`HEIC image is ${first.width}x${first.height}, over ${MAX_INPUT_PIXELS} pixels`);
		}
		const { data, width, height } = await first.decode();
		return sharp(data, { raw: { width, height, channels: 4 } });
	} finally {
		images.dispose();
	}
};

const convertWithSharp = async (buffer: Buffer, to: 'jpeg' | 'png' | 'webp', quality: number): Promise<Buffer> => {
	const image = sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS });
	const { format } = await image.metadata();
	// Output drops EXIF, so apply its orientation first or phone photos come out sideways.
	image.rotate();
	if (!DECODABLE_FORMATS.has(format)) throw new Error(`Unsupported image format: ${format}`);
	return encode(image, to, quality);
};

export const convertImageType = async (
	buffer: Buffer,
	type: 'jpeg' | 'png' | 'webp' | 'heic' | 'jpg',
	to: 'jpeg' | 'png' | 'webp',
	/** 1-100, as sharp takes it. */
	quality = 80,
) => (type === 'heic' ? encode(await heicToSharp(buffer), to, quality) : convertWithSharp(buffer, to, quality));
