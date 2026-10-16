import { type ZodType } from 'zod';

type UnwrappableZod = ZodType & { options?: readonly string[]; unwrap?: () => ZodType };

/** Unwrap optional/nullable/default wrappers and return enum options when present. */
export function getZodEnumOptions(schema: ZodType): readonly string[] | undefined {
	let current: ZodType = schema;
	for (let depth = 0; depth < 10; depth++) {
		const candidate = current as UnwrappableZod;
		if (Array.isArray(candidate.options)) {
			return candidate.options;
		}
		if (typeof candidate.unwrap === 'function') {
			const next = candidate.unwrap();
			if (next === current) break;
			current = next;
			continue;
		}
		const inner = (current as { def?: { innerType?: ZodType } }).def?.innerType;
		if (inner) {
			current = inner;
			continue;
		}
		break;
	}
	return undefined;
}
