---
globs:
  - "libs/firebase/maple-functions/**"
  - "apps/functions/**"
---

# Firebase Cloud Functions Rules

## Naming Convention (CRITICAL)

Cloud Function libraries **MUST** follow this naming pattern:
- Project name: `firebase-maple-functions-{function-name}`
- Location: `libs/firebase/maple-functions/{function-name}/`
- This naming is **REQUIRED** for CI/CD to detect and deploy the function
- Validate with: `npx nx show projects | grep firebase-maple-functions`

For the full creation procedure, use the `create-cloud-function` skill.

## No package.json in Libraries

Nx libraries under `libs/` should NOT have their own `package.json`:
- The root `package.json` and `tsconfig.base.json` handle all dependency management
- If `nx generate` auto-creates one, delete it
- esbuild bundles from source; no intermediate build step needed

## Deployment

- Region: `us-east4` (Northern Virginia)
- Codebase prefix: `maple-functions`
- Deploy is automatic via CI/CD on merge to main
- Never run `firebase deploy` manually

## Functions Entry Point

All functions must be exported from `apps/functions/src/index.ts`.

## Testing

- Cloud Functions CAN be unit tested
- Use `vi.mock()` to mock repositories and external services
- See ADR-017 for patterns

## After Changes

- Update `docs/reference/deployed-functions.md` when adding new functions
- Update `docs/reference/implementation-status.md` when completing features
