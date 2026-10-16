/**
 * Produces a flat list of what changed between two objects — for audit logs. Nested
 * objects/arrays are walked recursively and rendered as dotted/indexed paths (e.g.
 * `nested.product`, `items.2.price`).
 */

const DEFAULT_IGNORE_KEYS = ['id', '_id', '__v', 'createdAt', 'updatedAt'];
const DEFAULT_MAX_VALUE_LENGTH = 80;
const DEFAULT_MAX_DEPTH = 5;

export interface AuditLogChange {
	field: string;
	from: unknown;
	to: unknown;
}

export interface DiffOptions {
	/**
	 * Keys/paths to skip entirely (not descended into). Merged with the built-in defaults.
	 * A bare name (`password`) matches that key at *any* depth; a dotted path (`profile.bio`)
	 * matches only that exact field and its subtree.
	 */
	ignoreKeys?: string[];
	/** Skip the built-in ignore list (id/_id/__v/createdAt/updatedAt) and only use `ignoreKeys`. */
	noDefaultIgnore?: boolean;
	/** Stringified values longer than this are truncated with an ellipsis. */
	maxValueLength?: number;
	/** Stop recursing past this many levels — deeper changes collapse into a single value diff. */
	maxDepth?: number;
	/** Override how a field's value is rendered. Return `undefined` to fall back to the default. */
	formatValue?: (fieldPath: string, value: unknown) => unknown;
}

interface DiffContext extends Required<Omit<DiffOptions, 'formatValue'>> {
	leafIgnoreKeys: Set<string>;
	formatValue?: DiffOptions['formatValue'];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	// `null` and `undefined` both render as `null` via displaySide, so treat them as equal here too.
	if ((a === null || a === undefined) && (b === null || b === undefined)) return true;
	if (a instanceof Date || b instanceof Date) {
		return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
	}
	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
		return a.every((value, i) => deepEqual(value, b[i]));
	}
	if (isPlainObject(a) || isPlainObject(b)) {
		if (!isPlainObject(a) || !isPlainObject(b)) return false;
		const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
		return [...keys].every((key) => deepEqual(a[key], b[key]));
	}
	return typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b);
}

function truncate(text: string, maxValueLength: number): string {
	return text.length > maxValueLength ? `${text.slice(0, maxValueLength)}…` : text;
}

/**
 * Preserves the value's native type (Date, boolean, number, …) so it round-trips cleanly through
 * Mongo. Plain objects/arrays — which only show up here past `maxDepth` or on a type mismatch — are
 * JSON-stringified since there's no further structure to diff into.
 */
function defaultDisplay(value: unknown, maxValueLength: number): unknown {
	if (typeof value === 'string') return truncate(value, maxValueLength);
	if (typeof value === 'bigint') return value.toString();
	if (Array.isArray(value) || isPlainObject(value)) {
		try {
			return truncate(JSON.stringify(value), maxValueLength);
		} catch {
			return Object.prototype.toString.call(value);
		}
	}
	return value;
}

function joinPath(parent: string, segment: string): string {
	return parent ? `${parent}.${segment}` : segment;
}

function leafKey(path: string): string {
	return path.split('.').at(-1) ?? path;
}

function isIgnored(path: string, options: DiffContext): boolean {
	if (options.leafIgnoreKeys.has(leafKey(path))) return true;
	return options.ignoreKeys.some(
		(ignored) => ignored.includes('.') && (path === ignored || path.startsWith(`${ignored}.`)),
	);
}

function displaySide(path: string, value: unknown, options: DiffContext): unknown {
	if (value === undefined || value === null) return null;
	const formatted = options.formatValue?.(path, value);
	if (formatted !== undefined) return formatted;
	return defaultDisplay(value, options.maxValueLength);
}

function change(path: string, before: unknown, after: unknown, options: DiffContext): AuditLogChange {
	return {
		field: path,
		from: displaySide(path, before, options),
		to: displaySide(path, after, options),
	};
}

function diffObjectFields(
	before: Record<string, unknown>,
	after: Record<string, unknown>,
	path: string,
	options: DiffContext,
	depth: number,
): AuditLogChange[] {
	const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
	return [...keys].flatMap((key) => render(before[key], after[key], joinPath(path, key), options, depth + 1));
}

function diffArrayByIndex(
	before: unknown[],
	after: unknown[],
	path: string,
	options: DiffContext,
	depth: number,
): AuditLogChange[] {
	const length = Math.max(before.length, after.length);
	const changes: AuditLogChange[] = [];
	for (let index = 0; index < length; index += 1) {
		changes.push(
			...render(
				index < before.length ? before[index] : undefined,
				index < after.length ? after[index] : undefined,
				joinPath(path, String(index)),
				options,
				depth + 1,
			),
		);
	}
	return changes;
}

function render(before: unknown, after: unknown, path: string, options: DiffContext, depth: number): AuditLogChange[] {
	if (isIgnored(path, options) || deepEqual(before, after)) return [];
	if (depth > options.maxDepth) return [change(path, before, after, options)];

	if (isPlainObject(before) && isPlainObject(after)) {
		return diffObjectFields(before, after, path, options, depth);
	}

	if (Array.isArray(before) && Array.isArray(after)) {
		return diffArrayByIndex(before, after, path, options, depth);
	}

	return [change(path, before, after, options)];
}

/**
 * Diffs two plain objects (e.g. a document before/after an update) into structured
 * audit-log changes.
 *
 * @example
 * diffObjects({ name: 'AB', type: 'raw' }, { name: 'AC', type: 'unraw' });
 * // [{ field: 'name', from: 'AB', to: 'AC' }, { field: 'type', from: 'raw', to: 'unraw' }]
 */
export function diffObjects(before: object, after: object, options: DiffOptions = {}): AuditLogChange[] {
	const ignoreKeys = [...(options.noDefaultIgnore ? [] : DEFAULT_IGNORE_KEYS), ...(options.ignoreKeys ?? [])];

	const resolved: DiffContext = {
		ignoreKeys,
		leafIgnoreKeys: new Set(ignoreKeys.filter((key) => !key.includes('.'))),
		noDefaultIgnore: options.noDefaultIgnore ?? false,
		maxValueLength: options.maxValueLength ?? DEFAULT_MAX_VALUE_LENGTH,
		maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
		formatValue: options.formatValue,
	};

	return diffObjectFields(before as Record<string, unknown>, after as Record<string, unknown>, '', resolved, 0);
}
