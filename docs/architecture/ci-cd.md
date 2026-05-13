# CI/CD Pipeline

## Package Manager

This project uses **pnpm** (v9.x) via Corepack. The version is pinned in `package.json` under `packageManager`.

All CI workflows use `pnpm/action-setup@v4` which reads the version from `package.json` automatically.

## PR Build Check

**Workflow**: `.github/workflows/build-check.yml` - Runs on every PR:

**Install-once pattern**: A dedicated `install` job runs `pnpm install --frozen-lockfile` once and saves `node_modules` to cache. All downstream jobs restore from this cache instead of installing independently.

**Two-layer caching**:
- Layer 1: pnpm store (`~/.local/share/pnpm/store/v3`) — cached via `actions/setup-node` with `cache: 'pnpm'`, avoids registry downloads
- Layer 2: `node_modules` — cached via `actions/cache`, avoids install/linking entirely on cache hit

**Jobs** (all depend on `install`):
- Security audit (`pnpm audit --audit-level=high`)
- TypeScript typecheck — `nx affected -t typecheck`
- Build — `nx affected -t build`
- Unit tests with coverage
- Storybook build (`nx affected -t build-storybook`) and interaction tests
- Integration tests (always builds the 4 functions codebases — affected conversion deferred until module boundary tags land)

**Affected detection in PRs**: `nrwl/nx-set-shas@v4` derives the base/head SHAs from the PR event so `nx affected` only rebuilds projects whose source (or transitively a dependency) changed since the merge base. Jobs needing affected detection use `fetch-depth: 0` so the full git history is available.

## Functions Deploy

**Workflows**:
- `.github/workflows/firebase-functions-merge.yml` — Deploys affected functions on merge to main (prod)
- `.github/workflows/firebase-functions-dev.yml` — Deploys affected functions on push to feature/fix branches (dev)

**Auth**: Workload Identity Federation (keyless) — no secrets required
**Region**: All functions deploy to `us-east4` (Northern Virginia)

### Codebases

Functions are split into 4 Firebase codebases to reduce cold start times (see ADR-026):

| Codebase | App Project | Entry Point |
|----------|-------------|-------------|
| `maple-core` | `apps/functions/` | `apps/functions/src/index.ts` |
| `maple-calendar` | `apps/functions-calendar/` | `apps/functions-calendar/src/index.ts` |
| `maple-square` | `apps/functions-square/` | `apps/functions-square/src/index.ts` |
| `maple-sync` | `apps/functions-sync/` | `apps/functions-sync/src/index.ts` |

### How CI determines what to deploy

1. **Affected detection**: `nx show projects --affected` finds changed function libraries (`firebase-maple-functions-*`)
2. **Codebase mapping**: `function-codebases.json` maps each library to its codebase. Functions not in the mapping default to `maple-core`.
3. **Build**: Only affected codebases are built via `nx run {project}:build`
4. **Lockfile cleanup**: Nx-generated `pnpm-lock.yaml` files are deleted from `dist/` — they can miss aliased transitive deps (e.g. `square-legacy`). Firebase Cloud Build does a fresh `pnpm install` instead.
5. **Deploy matrix**: Functions are batched into groups of 5 and deployed in parallel per codebase.

## Functions Build Pattern

Each codebase app uses esbuild via `@nx/esbuild:esbuild`:
- `generatePackageJson: true` — Nx creates a `package.json` in `dist/` with only the deps that codebase needs
- `bundle: true` with `thirdParty: false` — code is bundled but npm dependencies are externalized for Firebase to install
- Each codebase's `tsconfig.app.json` must include paths to all function libraries it exports

### Validation

Run `./tools/validate-function-tsconfigs.sh` to check that:
- Every function exported from an entry point has its library in the codebase's `tsconfig.app.json`
- Every non-core function has a mapping in `function-codebases.json`

## Web App Deploy

- Web app deploys to Vercel automatically on merge to main
- Vercel uses `corepack enable && pnpm install` for installation
- Dev app: `dev.mapleandsprucefolkarts.com`
- Prod app: `mapleandsprucefolkarts.com`

## Registration E2E (PR-time)

**Workflow**: `.github/workflows/build-check.yml` → `registration-e2e` job.

**What it covers**: Drives the production `RegistrationWidget` (mounted in `apps/registration-test-harness`, a minimal Vite app) against the local Firebase emulator, end-to-end through Chromium. Closes the gap between Storybook interaction tests (which mock callable args) and cloud-function integration tests (which can't see frontend arg-shape bugs). The same suite is intended to run again in Phase 2 against the deployed dev project — only difference is `HARNESS_BASE_URL`.

**Components**:
- `apps/registration-test-harness/` — Vite app, mounts `RegistrationWidget` with `env="emulator"` so `firebase-init.ts` calls `connectFunctionsEmulator(127.0.0.1, 5001)`.
- `apps/registration-e2e/` — Playwright suite + `global-setup.ts` that seeds Firestore via `@maple/firebase/integration-test-utils` (same fixtures the cloud-function integration tests use).
- `tools/run-registration-e2e.sh` — local runner; respects `EMULATOR_PORT_OFFSET` for parallel worktrees. Pass `--ui` or `--debug` for Playwright's interactive modes.

**Scope (Phase 1)**: load → cost recalc on attendee add/remove → discount apply → invalid discount. **Stops before Square tokenization** — the "Register & Pay" button stays disabled until the Square Web Payments SDK marks the card form ready, which requires real Sandbox credentials. That's a Phase 2/3 concern.

**Why ALLOWED_ORIGINS gets extended at boot**: the function CORS middleware returns 403 for unknown origins, which the Firebase SDK maps to `permission-denied`. The CI step (and the local script) appends `http://127.0.0.1:4173` to `ALLOWED_ORIGINS` in each codebase's `.env` before booting the emulator.
