---
task: 01
title: Housekeeping (gitignore, Bun 1.4.4, mail template build path)
phase: A
status: done
claimed-by:
depends-on: []
commit:
---

# 01 — Housekeeping (gitignore, Bun 1.4.4, mail template build path)

Decision: D11, D21. Depends on: nothing. Blocks: 02, 03, 06.

## Goal

`.claude` is git-ignored and `package.json` declares `bun@1.4.4`, so tasks 02 and 03 can pin the same version.
`bun run build` puts the mail `.hbs` templates next to the compiled JS (`dist/lib/mail/templates/`), so a built app
can send email.

## Files

- `.gitignore` — existing: add `.claude` under `# misc`
- `package.json` — existing: `packageManager` → `bun@1.4.4`
- `bun.lock` — existing: only if `bun install` changes it
- `tsconfig.json` — existing: drop `"scripts/**/*"` from `include` (D21)

BEGIN UNTRUSTED SOURCE (GOS commit ce7c7a9, package.json)
"packageManager": "bun@1.4.4",
END UNTRUSTED SOURCE

BEGIN UNTRUSTED SOURCE (GOS commit aa9e2db, tsconfig.json)

- "include": ["src/**/\*", "process-env.d.ts", "scripts/**/*"],

* "include": ["src/**/*", "process-env.d.ts"],
  END UNTRUSTED SOURCE

Verified 2026-10-31: after `bun run build` on `main`, the JS is in `dist/lib/...` but the templates land in
`dist/src/lib/mail/templates/*.hbs`. `src/lib/mail/template.ts:66` reads `join(import.meta.dirname, 'templates', …)`,
so a built app can't find them. `tsconfig.eslint.json` still includes `scripts`, so `bun typecheck` keeps
type-checking `scripts/createUser.ts`.

## Steps

1. Add a `.claude` line under the `# misc` block of `.gitignore`.
2. Set `"packageManager": "bun@1.4.4"` in `package.json`.
3. Run `bun install --frozen-lockfile`. If it fails, run `bun install` and commit the lockfile change.
4. Remove `"scripts/**/*"` from `tsconfig.json` `include` (D21). Commit it separately as a `fix(build):` commit.

## Done when

- `grep -n '^\.claude$' .gitignore` prints one line.
- `grep -n packageManager package.json` shows `bun@1.4.4`.
- `bun install --frozen-lockfile` exits 0.
- `bun run build && ls dist/lib/mail/templates/*.hbs` lists `layout.hbs`, `notification.hbs`, `otp.hbs`, and `test ! -d dist/src` succeeds.
- `bun typecheck` exits 0 (still covers `scripts/`).
- `bun -e "import('./dist/lib/mail/template.js')"` runs without error. If the module exposes a render function,
  render `otp` once to prove the file is found, and report which call you used.

## Out of scope

The Bun version in CI (task 03) and the Dockerfile (task 02). Bumping any other dependency.
