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
- TypeScript typecheck (`pnpm exec nx run maple-spruce:typecheck`)
- Build web app and functions
- Unit tests with coverage
- Storybook build and interaction tests

## Functions Deploy

**Workflow**: `.github/workflows/firebase-functions-merge.yml` - Deploys only affected functions on merge to main.

- **Auth**: Workload Identity Federation (keyless) - no secrets required
- **Region**: All functions deploy to `us-east4` (Northern Virginia, close to WV business)
- **Codebase**: `maple-functions` - functions are filtered by this codebase prefix

## Functions Deployment Pattern

Functions follow Mountain Sol's auto-generated package.json pattern:
- `apps/functions/project.json` has `generatePackageJson: true`
- No static `package.json` in `apps/functions/`
- Nx auto-detects dependencies from imports during build
- esbuild bundles code with `thirdParty: false` (externalize deps for Firebase to install)

## Web App Deploy

- Web app deploys to Vercel automatically on merge to main
- Vercel uses `corepack enable && pnpm install` for installation
- Dev app: `dev.mapleandsprucefolkarts.com`
- Prod app: `mapleandsprucefolkarts.com`
