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

**Workflow**: `.github/workflows/firebase-functions-merge.yml` — the only deploy pipeline. Per-branch dev deploys (`firebase-functions-dev.yml`) were removed in Phase 2 (#TBD); dev is a post-merge-only environment now.

**Pipeline shape**:

```
merge to main
  ├── prepare_and_build  (build affected codebases, upload artifacts)
  ├── deploy_functions_dev   → maple-and-spruce-dev
  ├── deploy_harness_dev     → maple-spruce-registration-test.web.app
  ├── deploy_vercel_dev      → admin app on dev Vercel project (business-dev.*)
  └── e2e_dev (registration Playwright suite vs deployed dev)
       └── approve_prod  ← MANUAL APPROVAL via `production` Environment
            ├── deploy_functions_prod        → maple-and-spruce
            ├── publish_webflow_components   → Webflow library share
            └── deploy_vercel_prod           → maple-spruce on Vercel

  + deploy_firestore_indexes_dev   (independent → maple-and-spruce-dev)
  + deploy_firestore_indexes        (independent → maple-and-spruce, prod)
```

**Two gates**:
1. **`e2e_dev`** must pass — the suite hits deployed dev callables + dev Firestore. Failures here mean prod stays on the previous deploy. `approve_prod` is *also* gated on `deploy_vercel_dev` succeeding, so a broken dev admin-app deploy blocks prod promotion too.
2. **`approve_prod`** requires a human to click "Review pending deployments" in the GitHub UI. Uses the `production` Environment (Settings → Environments) which has required reviewers configured. One approval unlocks all three prod jobs.

**Why `deploy_vercel_dev` runs every merge and isn't approval-gated**: dev must *lead* prod — it's the known-good environment we check before promoting. `vercel.json` sets `git.deploymentEnabled.main = false`, which disables Vercel's native git auto-deploy for **every** project linked to this repo (prod *and* dev), so without this job the dev project's production domain (`business-dev.*`) silently freezes at the last pre-disable commit. It runs unconditionally (no affected gate) because web-only changes don't flip the functions `has_changes` flag.

**Why Firestore indexes don't gate**: index additions are forward-compatible (queries work without them, just slower or with a "missing index" error). Index builds take minutes server-side after the deploy submits the spec, so gating E2E on index readiness would add a lot of wall-clock without catching anything new. The PR-time analyzer (`tools/check-firestore-indexes.ts`) enforces declaration; that's the load-bearing check.

**Indexes deploy to dev *and* prod**: there are two index-deploy jobs — `deploy_firestore_indexes_dev` (→ `maple-and-spruce-dev`) and `deploy_firestore_indexes` (→ prod). Both fire only when `firestore.indexes.json` changed in the merge (or on manual `workflow_dispatch`). Dev needs its own because the emulator doesn't enforce composite indexes, so a query missing a dev index passes every test and only fails against the live dev project. To backfill all declared indexes into a freshly-recreated dev project, run the workflow via `workflow_dispatch` (deploys regardless of file diff).

**Concurrency**: `concurrency.group: deploy-on-merge`, `cancel-in-progress: false`. Two back-to-back merges otherwise race on the shared dev project (B's dev deploy overwrites A's mid-E2E). Cancel-in-progress stays off so we never abort a deploy halfway.

**Auth**: Workload Identity Federation (keyless) for Firebase deploys.
- Dev: `github-deployer@maple-and-spruce-dev.iam.gserviceaccount.com`
- Prod: `github-deployer@maple-and-spruce.iam.gserviceaccount.com`

**Region**: All functions deploy to `us-east4` (Northern Virginia)

### Required GitHub Environment

A `production` Environment must exist (Settings → Environments → New environment). Without it, `approve_prod` auto-passes for any actor — defeating the gate.

Configure:
- **Required reviewers**: at minimum the repo owner. Multiple is fine — any one can approve.
- **Wait timer**: leave at 0 (the dev E2E is already the substantive check).
- **Deployment branches**: restrict to `main` only.

Optional but recommended: move `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` from repo-level secrets to Environment secrets scoped to `production`. That way only post-approval runs can read them.

### Required secrets

The Vercel jobs need these secrets (set once in repo settings → Secrets and variables → Actions):

- `VERCEL_TOKEN` — generated at <https://vercel.com/account/tokens>
- `VERCEL_ORG_ID` — from `.vercel/project.json` after `vercel link`
- `VERCEL_PROJECT_ID` — prod project (`maple-and-spruce-maple-spruce`), used by `deploy_vercel_prod`
- `VERCEL_PROJECT_ID_DEV` — dev project (`maple-and-spruce-dev`), used by `deploy_vercel_dev`. Same Vercel team, so `VERCEL_ORG_ID` and `VERCEL_TOKEN` are reused — only the project id differs.

Without `VERCEL_PROJECT_ID`, `deploy_vercel_prod` fails and prod Vercel stays on the previous deploy. Without `VERCEL_PROJECT_ID_DEV`, `deploy_vercel_dev` fails and `business-dev` stays stale (which now also blocks prod promotion, since `approve_prod` depends on it). Firebase deploys are unaffected either way.

### Required Firebase Hosting site

The harness deploys to a dedicated Hosting site `maple-spruce-registration-test` on the dev project. The workflow runs `firebase hosting:sites:create … || true` so it's idempotent — first deploy creates the site, subsequent deploys reuse it. The site URL `https://maple-spruce-registration-test.web.app` is hard-coded into `apps/registration-e2e/playwright.config.ts` (override with `HARNESS_BASE_URL` env if you need to redirect it).

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

**Previews (PRs)**: Vercel auto-deploys a preview from every PR. Unchanged by Phase 2.

**Production**: Auto-deploy-from-main is **disabled** in `vercel.json` (`git.deploymentEnabled.main = false`). Prod promotion happens from the merge workflow's `deploy_vercel_prod` job, gated on the dev E2E. See "Functions Deploy" above for the full chain.

- Vercel uses `corepack enable && pnpm install` for installation
- Prod app: `mapleandsprucefolkarts.com`

## Registration E2E

The same Playwright suite runs in two places, picked by `E2E_TARGET`:

| Target | When | Backend | Harness | Seeding |
|--------|------|---------|---------|---------|
| `emulator` (default) | PR-time (`build-check.yml` → `registration-e2e`) | local Firebase emulator | local Vite (`webServer` in playwright.config) | REST against the emulator |
| `dev` | Post-merge (`firebase-functions-merge.yml` → `e2e_dev`) | deployed `maple-and-spruce-dev` | deployed `maple-spruce-registration-test.web.app` | Admin SDK against dev Firestore (auth via WIF / GOOGLE_APPLICATION_CREDENTIALS) |

**Why both**: emulator catches arg-shape and render-contract bugs cheaply on every PR. The dev target catches the things emulator can't — missing Firestore composite indexes (the emulator doesn't enforce them), CORS / auth differences, callable cold-start behavior.

**Components**:
- `apps/registration-test-harness/` — Vite app, mounts `RegistrationWidget`. Build mode (`VITE_TARGET_ENV`) picks whether `firebase-init.ts` connects the emulator or hits the deployed dev project.
- `apps/registration-e2e/` — Playwright suite + `global-setup.ts` that branches on `E2E_TARGET` (REST seed for emulator, Admin SDK seed for dev). Same spec assertions run against either backend.
- `tools/run-registration-e2e.sh` — local runner for the emulator path; respects `EMULATOR_PORT_OFFSET` for parallel worktrees. Pass `--ui` or `--debug` for Playwright's interactive modes.

**Scope**: load → cost recalc on attendee add/remove → discount apply → invalid discount. **Stops before Square tokenization** — the "Register & Pay" button stays disabled until the Square Web Payments SDK marks the card form ready, which requires real Sandbox credentials.

**Why ALLOWED_ORIGINS gets extended**: the function CORS middleware returns 403 for unknown origins, which the Firebase SDK maps to `permission-denied`.
- Emulator mode (local + PR-time CI): the script/job appends `http://127.0.0.1:4173` to `ALLOWED_ORIGINS` in each codebase's `.env` before booting the emulator.
- Dev mode: `https://maple-spruce-registration-test.web.app` and `.firebaseapp.com` are baked into `.env.dev` so dev's deployed callables accept calls from the harness without per-run injection.

**Webflow side effects from dev seeding**: when `global-setup.ts` writes the seeded class to dev Firestore, the `syncClassToWebflow` trigger fires. Dev runs with `FirebaseProject.isDev = true`, which:
- Sets `is-dev-environment: true` on the resulting CMS item
- Sets `shouldPublish = false` — the item exists in the Webflow CMS but is **never published to the live site**

Since the seed uses deterministic IDs, repeated runs update the same CMS item rather than accumulating new ones.
