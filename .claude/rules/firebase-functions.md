---
globs:
  - "libs/firebase/maple-functions/**"
  - "apps/functions/**"
  - "apps/functions-calendar/**"
  - "apps/functions-square/**"
  - "apps/functions-sync/**"
---

# Firebase Cloud Functions Rules

## Naming Convention (CRITICAL)

Cloud Function libraries **MUST** follow this naming pattern:
- Project name: `firebase-maple-functions-{function-name}`
- Location: `libs/firebase/maple-functions/{function-name}/`
- This naming is **REQUIRED** for CI/CD to detect and deploy the function
- Validate with: `npx nx show projects | grep firebase-maple-functions`

For the full creation procedure, use the `create-cloud-function` skill.

## Codebases

Functions are split into 4 Firebase codebases to reduce cold start times:

| Codebase | App Project | Heavy Deps | Entry Point |
|----------|-------------|------------|-------------|
| `maple-core` | `apps/functions/` | firebase-admin, vest | `apps/functions/src/index.ts` |
| `maple-calendar` | `apps/functions-calendar/` | ical-generator | `apps/functions-calendar/src/index.ts` |
| `maple-square` | `apps/functions-square/` | square SDK | `apps/functions-square/src/index.ts` |
| `maple-sync` | `apps/functions-sync/` | webflow-api | `apps/functions-sync/src/index.ts` |

When adding a new function, export it from the correct codebase's entry point and add a mapping in `function-codebases.json` if it's not in `maple-core`.

## No package.json in Libraries

Nx libraries under `libs/` should NOT have their own `package.json`:
- The root `package.json` and `tsconfig.base.json` handle all dependency management
- If `nx generate` auto-creates one, delete it
- esbuild bundles from source; no intermediate build step needed

## Deployment

- Region: `us-east4` (Northern Virginia)
- Deploy is automatic via CI/CD on merge to main
- Never run `firebase deploy` manually
- CI/CD reads `function-codebases.json` to map functions to codebases

## Functions Entry Points

Each codebase has its own entry point:
- Core CRUD/admin: `apps/functions/src/index.ts`
- Calendar ICS feeds: `apps/functions-calendar/src/index.ts`
- Square integration: `apps/functions-square/src/index.ts`
- Webflow sync: `apps/functions-sync/src/index.ts`

## Runtime Options

Use `Functions.endpoint.withOptions()` for per-function runtime config:
```typescript
Functions.endpoint
  .withOptions({ minInstances: 1, concurrency: 80, memory: '512MiB' })
  .handle<Req, Res>(async (data) => { ... });
```

## Testing

- Cloud Functions CAN be unit tested
- Use `vi.mock()` to mock repositories and external services
- See ADR-017 for patterns

## After Changes

- Update `docs/reference/deployed-functions.md` when adding new functions
- Update `docs/reference/implementation-status.md` when completing features
- Update `function-codebases.json` if the function is not in `maple-core`
