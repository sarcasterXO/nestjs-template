---
task: 08
title: Cross-verification
phase: C
status: done
claimed-by:
depends-on: [02, 03, 04, 05, 06, 07]
commit:
---

# 08 — Cross-verification

Decision: all (D1–D20). Depends on: 02, 03, 04, 05, 06, 07. Blocks: nothing.

## Goal

Prove the backport is generic, consistent and green as a whole: no GOS-specific names, one Bun version
everywhere, docs that match the code, and all checks passing on the final branch.

## Files

- None changed unless a check fails. A fix goes in a separate `fix:` commit, with the failing check named in the commit body.

## Steps

1. Genericity (working agreement):
   `grep -rniE 'aaabed|gos-|\bgos\b|infisical|aaabed-runners|Aaabed-Infra' --exclude-dir={node_modules,dist,.git,plans} .` → no output.
2. Bun version consistency (D11): `package.json` `packageManager`, `ci.yml` `bun-version`, and the Dockerfile
   `BUN_IMAGE` tag all say `1.4.4`.
3. No CD (D3): `ls .github/workflows` → `ci.yml` only. CORS unchanged (D5): `git diff main -- src/main.ts` touches only the `enableShutdownHooks()` line (D24).
4. Docs match code:
   - AGENTS.md mentions `countBy`, `setOrUnset`, the null → `$unset` rule, `phoneToRecipient`, `ci.yml`, and that the image doesn't set NODE_ENV.
   - AGENTS.md "Architecture" tree still lists every `src/` top-level folder (the new `lib/util/Phone.ts`, if created, lives under `util/`, which is already described).
   - README's Docker/deploy note matches the Dockerfile (non-root, `dist/main.js`, NODE_ENV from env).
5. Full checks: `bun run preflight`, `bun run test:e2e`.
6. Image: `docker build -t template-api .` then the four `docker run` checks from task 02.
7. `bun sync` idempotent: run it, `git status --porcelain` empty.
8. Health (D12–D16, D23, D24): with the image running against a reachable Mongo, `curl` `/health/live` → 200 and
   `/health` → 200, `/health/ready` → 404; `docker inspect --format '{{.State.Health.Status}}'` reaches `healthy`;
   `/health*` absent from Swagger JSON and from request logs; `docker stop` on the container logs the DB disconnect
   before exit; AGENTS.md Architecture tree lists `health/`.
9. Pagination (D17–D20): `GET /notification` and `GET /audit-log` with no `page` return at most 10 rows with
   `X-Current-Page: 1`; `?limit=101` → 400 on all three list endpoints; `GET /users/export` and
   `GET /audit-log/export` still contain every row; AGENTS.md no longer says "omit page = everything".
10. Mail build (D21): `bun run build` → `dist/lib/mail/templates/otp.hbs` exists and `dist/src` doesn't. Same
    inside the image: `docker run --rm --entrypoint ls template-api dist/lib/mail/templates` lists the `.hbs` files.
11. Typecheck kept (D22): `package.json` still has `typecheck`, `ci.yml` still runs it, and
    `.github/problemMatchers/tsc.json` exists.

## Done when

- Every step above passes, and its command output is pasted into the final report.
- `plans/gos-backport/board.sh` shows 01–07 `done` with commits filled in.

## Out of scope

New features. Anything listed under "Deferred, do not bury" in the overview.
