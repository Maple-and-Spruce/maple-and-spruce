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

**Unit tests**: Use `vi.mock()` to mock repositories and external services. See ADR-017 for patterns.

**Integration tests**: Test functions against real Firebase emulators (auth, firestore, functions) with a mock HTTP server for Square/Webflow APIs. See ADR-027.

- Run locally: `./tools/run-integration-tests.sh` (all suites) or `./tools/run-integration-tests.sh square` (one suite)
- Test suites: `apps/functions-integration-tests-{artist,class,instructor,category,discount,calendar,registration,utility,square}/`
- Mock server: `libs/firebase/integration-test-mock-server/` — intercepts Square and Webflow SDK calls via `SQUARE_BASE_URL` / `WEBFLOW_BASE_URL` env vars
- Test utilities: `libs/firebase/integration-test-utils/` (auth-helper, firestore-helper, http-client, fixtures)
- For verbose output on a failing suite: `npx vitest run --config apps/functions-integration-tests-<suite>/vitest.config.ts --reporter=verbose` (while emulators + mock server are running)

### Emulator environment setup

Firebase emulator requires ALL project-level `defineString`/`defineSecret` params in **every** codebase's `.env`, even if that codebase doesn't use them. Missing params cause a silent hang (stdin prompt) with no error message. The solution is to copy `.env.dev` to every codebase's dist dir, then append codebase-specific overrides. The script and CI workflow both do this automatically.

When adding a new `defineString`/`defineSecret` param, add it to `.env.dev` and it will propagate to all codebases.

### Firestore trigger feedback loops

Sync functions that write back to the document they're triggered on (e.g., storing `webflowItemId` after syncing to Webflow) must guard against re-triggering themselves:

```typescript
// Only write if the value actually changed — prevents trigger → write → trigger loop
if (result.webflowItemId && doc.webflowItemId !== result.webflowItemId) {
  await Repository.updateWebflowItemId(doc.id, result.webflowItemId);
}
```

This guard is required on `syncClassToWebflow`, `syncArtistToWebflow`, and `syncInstructorToWebflow`.

### Mock server routes

When an external API adds a new endpoint to the payment/sync flow, add a matching route to `libs/firebase/integration-test-mock-server/src/lib/routes/`. Current routes:

- **Square**: `POST /v2/orders`, `POST /v2/payments`, `GET /v2/payments/:id`, `POST /v2/refunds`, catalog CRUD
- **Webflow**: CMS item CRUD + publish on `/collections/:id/items`

## CI/CD Notes

- CI deletes Nx-generated `pnpm-lock.yaml` files from `dist/` before upload. Nx's `generatePackageJson` creates subset lockfiles that miss aliased transitive deps (e.g. `square-legacy`). Removing them lets Firebase Cloud Build do a fresh `pnpm install` with proper resolution.
- Run `./tools/validate-function-tsconfigs.sh` to check that tsconfig includes and `function-codebases.json` mappings are consistent with entry point exports.
- Integration tests run in a separate CI job with Java 21 (required by Firestore emulator). The job builds all 4 codebases, copies `.env.dev` to each, starts the mock server, and runs `firebase emulators:exec`.

## After Changes

- Update `docs/reference/deployed-functions.md` when adding new functions
- Update `docs/reference/implementation-status.md` when completing features
- Update `function-codebases.json` if the function is not in `maple-core`
- Run `./tools/validate-function-tsconfigs.sh` to catch missing tsconfig includes or codebase mappings
