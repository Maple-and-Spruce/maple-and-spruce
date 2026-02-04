# CI/CD Pipeline

## PR Build Check

**Workflow**: `.github/workflows/build-check.yml` - Runs on every PR:
- Security audit (`npm audit --audit-level=high`)
- TypeScript typecheck (`nx run maple-spruce:typecheck`)
- Build web app and functions

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
- Dev app: `dev.mapleandsprucefolkarts.com`
- Prod app: `mapleandsprucefolkarts.com`
