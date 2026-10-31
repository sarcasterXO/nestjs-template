---
task: 09
title: Remove plan folder before merge
phase: C
status: todo
claimed-by:
depends-on: [08]
commit:
---

# 09 — Remove plan folder before merge

Decision: D25. Depends on: 08. Blocks: nothing.

## Goal

The merged template contains no `plans/` folder, so projects cloned from it don't inherit this plan. The plan
remains in the branch history.

## Files

- `plans/gos-backport/` — existing: delete
- `plans/` — delete if empty

## Steps

1. Confirm 08 is `done` and every task 01–08 has a `commit` filled in (`./plans/gos-backport/board.sh`).
2. Paste the final `BOARD.md` into the PR description, so the record survives outside the tree.
3. `git rm -r plans/gos-backport` (and `plans/` if empty), commit as `chore: remove gos-backport plan`.
4. Re-run the genericity grep from the working agreement without `plans` in `--exclude-dir`: no output.

## Done when

- `test ! -e plans` succeeds on the branch tip.
- `bun run preflight` still exits 0.

## Out of scope

Squashing or rewriting earlier commits.
