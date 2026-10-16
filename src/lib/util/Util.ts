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
