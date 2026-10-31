---
task: 04
title: Mongo countBy + PATCH null helpers
phase: A
status: done
claimed-by:
depends-on: []
commit:
---

# 04 — Mongo countBy + PATCH null helpers

Decision: D6, D7. Depends on: nothing. Blocks: 05, 07, 08.

## Goal

`MongoBaseService` can count documents per distinct field value in one aggregation. `lib/util/Util.ts` provides
`withoutNulls` and `setOrUnset`. AGENTS.md documents both and the rule that `null` in a PATCH means clear (`$unset`).

## Files

- `src/lib/mongo/MongoBaseService.ts` — existing: add public `countBy` after the last public method, before the private `findMany`
- `src/lib/util/Util.ts` — existing: append `withoutNulls`, `setOrUnset`
- `AGENTS.md` — existing: "Adding a new entity/module" step 4 (PATCH rule) and the `MongoBaseService` bullet under Conventions/pitfalls

BEGIN UNTRUSTED SOURCE (GOS src/lib/mongo/MongoBaseService.ts, commit 946de0f)
public async countBy(query: QueryFilter<TOutput>, groupKey: string): Promise<Map<string, number>> {
const rows: { key: string; count: number }[] = await this.aggregate([
{ $match: query },
{ $sortByCount: groupKey },
{ $replaceWith: { key: '$_id', count: '$count' } },
]);
return new Map(rows.map(({ key, count }) => [key, count]));
}
END UNTRUSTED SOURCE

BEGIN UNTRUSTED SOURCE (GOS src/lib/util/Util.ts, commit 946de0f)
export const withoutNulls = <T extends object>(data: T) =>
Object.fromEntries(Object.entries(data).filter(([, value]) => value !== null && value !== undefined)) as {
[K in keyof T]: Exclude<T[K], null>;
};
export const setOrUnset = <T extends object>(data: T) => {
const cleared = Object.keys(data).filter((key) => data[key as keyof T] === null);
return {
$set: withoutNulls(data),
...(cleared.length > 0 ? { $unset: Object.fromEntries(cleared.map((key) => [key, 1])) } : {}),
};
};
END UNTRUSTED SOURCE

## Steps

1. Add `countBy` to `MongoBaseService` with the GOS behaviour (D6). Keep the one-line JSDoc that `groupKey` is
   a `$field` path. Check that `this.aggregate` exists on the base class with that signature, and adapt if not.
2. Append `withoutNulls` and `setOrUnset` to `Util.ts` with the GOS behaviour and JSDoc (D7). Match the file's
   existing comment style.
3. AGENTS.md step 4: add one sentence saying update DTOs take `.nullable()` on optional fields a client may
   clear, and services pass the body through `setOrUnset(data)` so `null` → `$unset` and `undefined` → untouched.
   Under Conventions/pitfalls, extend the `MongoBaseService` bullet to mention `countBy(query, '$field')` for
   per-group counts instead of N `count` calls.
4. Verify `setOrUnset` output passes typecheck when given to `MongoBaseService.updateOne`. If `updateOne` doesn't
   accept an update with operators, record that in your report; task 05 needs it.

## Done when

- `bun typecheck && bun lint && bun run build` exit 0.
- `bun -e "import('./src/lib/util/Util.ts').then(({ setOrUnset }) => console.log(JSON.stringify(setOrUnset({ a: 1, b: null, c: undefined }))))"`
  prints `{"$set":{"a":1},"$unset":{"b":1}}`.
- `bun run test:e2e` passes (no regressions).

## Out of scope

Using the helpers in the user service (task 05). Adding a unit-test runner or spec files.
