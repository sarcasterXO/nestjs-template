import type { IncomingHttpHeaders } from 'node:http';
import type { Socket } from 'node:net';

export const trim = (str: string, max: number, suffix: string = '...') =>
	str.length > max ? `${str.slice(0, max - suffix.length)}${suffix}` : str;

/**
 * Get a random number from the given range
 */
export const randomNumber = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * Pick a given number of random elements from an array (without duplicates)

 */
export const getRandom = <T>(array: T[], amount: number): T[] => {
	const arr = [...array];

	if (!arr.length || !amount) return [];

	return Array.from(
		{ length: Math.min(amount, arr.length) },
		() => arr.splice(Math.floor(Math.random() * arr.length), 1)[0],
	);
};

/**
 * Returns random number between a range
 * @param min
 * @param max
 * @returns
 */

export const randomBetween = (min: number, max: number) => Math.floor(Math.random() * (max - min)) + min;

/**
 * Formats a stored phone as the recipient `SmsProvider` expects: `{ countryCode: '+1', number: '5550100' }` → `'15550100'`.
 */
export const phoneToRecipient = ({ countryCode, number }: { countryCode: string; number: string }) =>
	`${countryCode.replace(/^\+/, '')}${number}`;

/**
 * Drops `null` and `undefined` values, typing the rest as non-null.
 */
export const withoutNulls = <T extends object>(data: T) =>
	Object.fromEntries(Object.entries(data).filter(([, value]) => value !== null && value !== undefined)) as {
		[K in keyof T]: Exclude<T[K], null>;
	};

/**
 * Turns a PATCH body into `$set` for the given fields and `$unset` for every field sent as `null`.
 */
export const setOrUnset = <T extends object>(data: T) => {
	const cleared = Object.keys(data).filter((key) => data[key as keyof T] === null);
	return {
		$set: withoutNulls(data),
		...(cleared.length > 0 ? { $unset: Object.fromEntries(cleared.map((key) => [key, 1])) } : {}),
	};
};

/**
 * The gateway overwrites `X-Real-IP` with the connecting address, so it can't be spoofed, while the leftmost
 * `X-Forwarded-For` entry is whatever the client sent.
 */
export const clientIp = ({ headers, socket }: { headers: IncomingHttpHeaders; socket: Socket }) =>
	(headers['x-real-ip'] as string | undefined) ?? socket.remoteAddress ?? 'unknown';
