import { BadRequestException } from '@nestjs/common';

/**
 * `allowedFields` is required so clients can't sort on hidden fields like `password` or `sessions`.
 */
export function parseSortQuery(query: string, allowedFields: readonly string[]): Record<string, -1 | 1> {
	const sortCriteria: Record<string, -1 | 1> = {};
	const searchMatch = /\((?<temp1>.*)\)/.exec(query);
	if (!searchMatch) throw new BadRequestException('Invalid query format');

	const search = searchMatch.groups?.temp1;

	const [field, order] = search?.split('=') ?? [];
	if (!field || !order) {
		throw new BadRequestException(`Invalid criterion: "${search}". Expected format: "field=order".`);
	}

	const sortField = field.trim();
	if (!allowedFields.includes(sortField)) {
		throw new BadRequestException(`Cannot sort by "${sortField}". Allowed fields: ${allowedFields.join(', ')}.`);
	}

	let sortOrder: -1 | 1;

	switch (order.trim()) {
		case 'a-z':
		case '1':
			sortOrder = 1;
			break;
		case 'z-a':
		case '-1':
			sortOrder = -1;
			break;
		default:
			throw new BadRequestException(`Invalid sort order: ${order}`);
	}

	sortCriteria[sortField] = sortOrder;

	return sortCriteria;
}

function getNestedValue(obj: any, path: string): any {
	const keys = path.split('.');
	return keys.reduce((value, key) => value?.[key], obj);
}

export function sortArray<T>(array: T[], sortCriteria: Record<string, number>): T[] {
	const [field, order] = Object.entries(sortCriteria)[0];

	return [...array].sort((a, b) => {
		const aValue = getNestedValue(a, field);
		const bValue = getNestedValue(b, field);

		if (aValue < bValue) return -order;
		if (aValue > bValue) return order;
		return 0;
	});
}
