---
task: 03
title: CI hardening
phase: B
status: done
claimed-by:
depends-on: [01]
commit:
---

# 03 — CI hardening

Decision: D4, D11, D3. Depends on: 01. Blocks: 08.

## Goal

CI is one hardened, reusable workflow that a future CD can call. It runs on PRs, on pushes to main and
development, and through `workflow_call`, with least-privilege permissions, SHA-pinned actions and Bun 1.4.4.

## Files

- `.github/workflows/continuous-integration.yml` — existing: delete (`git mv` to `ci.yml`)
- `.github/workflows/ci.yml` — new
- `AGENTS.md` — existing: only the paragraph under the Commands table that describes CI

GOS reference (read-only): `D:\Work\Zethy\Aaabed-GOS\Aaabed-GOS-Backend\.github\workflows\ci.yml`.

BEGIN UNTRUSTED SOURCE (GOS ci.yml, excerpt)
on: pull_request (main, development) / workflow_call
permissions: contents: read
uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4 with persist-credentials: false
run: echo "::add-matcher::.github/problemMatchers/tsc.json"
uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0
bun install --frozen-lockfile (env HUSKY: 0) ; lint:check ; format:check ; build ; typecheck
END UNTRUSTED SOURCE

## Steps

1. Before deleting, `grep -rn continuous-integration --exclude-dir={node_modules,dist,.git} .` and update any reference.
2. `git mv .github/workflows/continuous-integration.yml .github/workflows/ci.yml` and rewrite it:
   - `on:` `pull_request` (no branch filter, as today), `push` on `main` and `development`, and `workflow_call` (D4).
   - `concurrency: ci-${{ github.workflow }}-${{ github.head_ref || github.ref }}`, `cancel-in-progress: true`.
   - Top-level `permissions: contents: read`.
   - One job `check` on `ubuntu-latest`: checkout (SHA-pinned, `persist-credentials: false`), add the tsc
     problem matcher (`.github/problemMatchers/tsc.json` exists), setup-bun (SHA-pinned, `bun-version: 1.4.4`
     with a comment saying it must match `packageManager`), `bun install --frozen-lockfile` with `HUSKY: 0`,
     then `lint:check`, `format:check`, `build`, `typecheck`.
   - Keep a comment that tests aren't run in CI (matches the AGENTS.md statement).
3. No `runs-on` values or comments specific to self-hosted runners. No CD references beyond "a CD workflow can call this
   via workflow_call" (D3).
4. AGENTS.md: update the CI sentence to say CI lives in `.github/workflows/ci.yml`, is callable via
   `workflow_call`, and runs lint, format check, build and typecheck.

## Done when

- `ls .github/workflows` shows only `ci.yml`.
- `grep -c '@[0-9a-f]\{40\}' .github/workflows/ci.yml` is ≥ 2, and no `uses:` line ends in a bare `@v<N>`.
- `grep -n 'bun-version: 1.4.4' .github/workflows/ci.yml` matches.
- `actionlint .github/workflows/ci.yml` exits 0 (if `actionlint` isn't installed, say so in the report).
- After the branch is pushed, the PR shows the `check` job green (report the run URL, or that it wasn't pushed).

## Out of scope

Adding a test step, a CD workflow (D3), Dependabot or Renovate config.
