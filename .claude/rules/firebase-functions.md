---
globs:
  - "libs/firebase/maple-functions/**"
  - "apps/functions/**"
  - "apps/functions-calendar/**"
  - "apps/functions-square/**"
  - "apps/functions-sync/**"
  - "libs/firebase/database/**"
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

### Global `maxInstances` cap (every function, every codebase)

`libs/firebase/functions/src/lib/global-runtime-options.ts` calls
`setGlobalOptions({ maxInstances: GLOBAL_MAX_INSTANCES })` (currently **1**). Each of the
4 entry points imports it on its **first line**, before any `export { … } from` re-export.

**Why:** unset `maxInstances` inherits the gen-2 backend default of **100**, and Cloud Run's
"Total CPU allocation, per project per region" quota reserves `maxInstances × cpu` per revision.
A deploy stacks the new revision's reservation on top of the old (until GC minutes later), and
firebase updates a whole codebase's functions concurrently — so a broad merge briefly reserves
`2 × maxInstances × cpu` for every function in the codebase at once. At the default 100 this failed
outright; even at 3 it intermittently tipped the region over on full-codebase redeploys (the
maple-sync deploy, most functions + deploys last). **1** keeps both the idle baseline and that
deploy-overlap spike minimal. `concurrency: 80` means one instance still serves 80 simultaneous
requests, so 1 is ample for this portal. Raising the (already large) region quota was the
alternative; capping lower is the more principled fix for a tiny app.

**Ordering contract:** `onRequest`/`onDocumentWritten`/`onSchedule` bake global options into
`__endpoint` at definition time, and re-exports evaluate before the entry-point body — so the
side-effect import must stay first. Don't move it below the re-exports or convert it to a
body-level call, or the cap silently reverts to the default 100. Per-function options (`withOptions({ maxInstances })`
or a trigger's own option object) still override the global upward when a function truly needs it.

## Warmup

Every function built through `Functions.endpoint.handle()` automatically accepts a warmup sentinel — clients can boot a cold instance ahead of a real call without the function author opting in.

The intercept lives in `functions.utility.ts` and short-circuits before auth, validator, role check, uniqueness checks, and the handler. CORS is still enforced.

**Client (from the Webflow widget or any callable consumer):**

```typescript
import { warmup } from '../lib/warmup';

// Fire-and-forget on widget mount for downstream calls the user will trigger soon
warmup(functions, 'calculateRegistrationCost', 'createRegistration');
```

**When to warm**: downstream functions that aren't called on first paint — e.g. functions invoked after the user types in a form or clicks a button. For first-paint functions (called immediately on mount), warmup is too late; use env-gated `minInstances: 1` instead.

**Don't**: schedule a recurring Cloud Scheduler ping to keep functions warm 24/7. That bills idle time when no users are visiting. Warmup should be driven by user presence on the page.

## Role Gating (callable-roles analyzer)

Every function exported from a codebase entry point **MUST** either declare a role (`.requiringRole([...])`, `createAdminFunction`, or `createRoleFunction`), be a Firestore/scheduled trigger, or be explicitly allowlisted as public/auth-only in `tools/check-callable-roles.ts`. This prevents a new callable shipping reachable without a role check (how the singular `getArtist`/`getStudent` were left auth-only until #620). Scoped-roles matrix: epic #617; authoritative access table: `apps/functions-integration-tests-utility/src/role-matrix.spec.ts`.

```bash
npx tsx tools/check-callable-roles.ts            # exits non-zero on any un-gated, un-allowlisted callable
npx tsx tools/check-callable-roles.ts --report   # prints every function + its gate classification
```

CI runs this on every PR (`build-check.yml` → `callable-roles` job). To add an intentionally public or auth-only endpoint, add it to the matching allowlist in the analyzer **with a comment saying why** — that diff is the reviewable record.

## Input Validation

Cloud functions that mutate entities **MUST** validate input using the shared Vest suites from `@maple/ts/validation`. Suites are declared with `staticSuite` (never `create`) so they're pure functions — no retained state across invocations, safe to call from warm cloud function containers without `.reset()`.

**Create pattern** — validate the full payload:

```typescript
import { createAdminFunction, throwValidationError } from '@maple/firebase/functions';
import { classValidation } from '@maple/ts/validation';

export const createClass = createAdminFunction<Req, Res>(async (data) => {
  const result = classValidation(data);
  if (result.hasErrors()) {
    throwValidationError(result.getErrors());
  }
  // ...server-only validation (uniqueness, refs) and repository.create
});
```

**Update (partial) pattern** — validate only the changed fields, using the existing record for cross-field context. Gate on `hasErrors()` (not `!isValid()`) because `only()` makes per-field `isValid()` unreliable:

```typescript
import {
  createAdminFunction,
  throwInvalidArgument,
  throwNotFound,
  throwValidationError,
} from '@maple/firebase/functions';
import { classValidation } from '@maple/ts/validation';

export const updateClass = createAdminFunction<Req, Res>(async (data) => {
  if (!data.id) throwInvalidArgument('Class ID is required');

  const existing = await Repository.findById(data.id);
  if (!existing) throwNotFound('Class', data.id);

  const fields = Object.keys(data).filter((key) => key !== 'id');
  if (fields.length > 0) {
    const result = classValidation({ ...existing, ...data }, fields);
    if (result.hasErrors()) {
      throwValidationError(result.getErrors());
    }
  }
  // ...repository.update
});
```

**Error helpers** (`throwInvalidArgument`, `throwNotFound`, `throwValidationError`) live in `@maple/firebase/functions` (`errors.utility.ts`). They throw typed `HttpsError` codes — prefer them over bare `throw new Error(...)` so clients can discriminate failures.

**Validation must run BEFORE any external writes** (Square, Webflow, payments). Invalid data must never reach external APIs and fail halfway through.

## Firestore Composite Indexes

**Every `.where()` chain that requires a composite index MUST have a matching entry in `firestore.indexes.json` in the same PR that introduces it.** A 20-day production outage was caused by an undeclared agreementTemplates index in 2026-05; the CI guardrail below was added to prevent recurrence.

### When a composite index is required

Firestore auto-creates single-field indexes; everything below needs a composite index declared in `firestore.indexes.json`:

- Two or more `.where()` filters on the same query (any combination of `==`, `!=`, `<`, `>`, etc.)
- A `.where()` + a `.orderBy()` on a *different* field
- `array-contains` or `array-contains-any` combined with any other filter or orderBy

### The Firestore emulator does NOT enforce composite indexes

Integration tests against the emulator will pass even when a query requires an index that isn't declared. A green test suite is **not** proof the query will run in prod. The only reliable verification is the analyzer (below) plus deploying to a real Firestore instance.

### Run the analyzer before committing

```bash
npx tsx tools/check-firestore-indexes.ts            # exits non-zero if any required index is undeclared
npx tsx tools/check-firestore-indexes.ts --verbose  # shows every query chain it found
```

The analyzer scans `libs/firebase/database/**/*.repository.ts`, `libs/firebase/maple-functions/**`, and `tools/`. When it finds an undeclared index, it emits the exact JSON object to paste into the `indexes` array of `firestore.indexes.json`. CI runs the same script on every PR (`build-check.yml` → `firestore-indexes` job).

### Adding a new query

1. Write the `.where()` / `.orderBy()` chain.
2. Run `npx tsx tools/check-firestore-indexes.ts`.
3. If it flags missing indexes, paste the emitted JSON object(s) into the `indexes` array in `firestore.indexes.json`.
4. Re-run the analyzer until it passes.
5. On merge to main, CI runs `firebase deploy --only firestore:indexes` automatically (see `firebase-functions-merge.yml` → `deploy_firestore_indexes` job, gated on the file actually changing). Each new composite index takes a few minutes to build; queries succeed once each one flips to `READY`.

### `firestore.indexes.json` is the source of truth — orphans warn, 409s retry

The merge-time deploy does NOT pass `--force`. Two behaviors to know about:

- New indexes from `firestore.indexes.json` are applied normally.
- Any index that exists in prod but isn't in the file (an "orphan") is **left untouched** and surfaced as a CI **warning** (not a hard fail) — orphans are unused, low-risk indexes, and blocking unrelated merges on pre-existing drift is friction. The real outage risk (a *missing* index) is caught at PR time by the analyzer, not here.
- A `409 "index already exists"` is **benign** and **auto-retried** (up to 12×) — it means the declared index is already present (a prior partial run, an auto-create-URL, or firebase-tools failing to match an index it just created). The job only fails if it's stuck on the *same* 409 twice (not converging) or hits a non-409 error. This mirrors the functions-deploy 409 retry from #537.

Two ways to resolve an orphan (optional — it only warns):

1. **Add it to `firestore.indexes.json`** (preferred when the query is real and lives somewhere — even if outside the analyzer's scan, like a one-off console query or a script).
2. **Delete it** with gcloud (if it's stale and nothing queries it). There is no `firebase firestore:indexes:delete` command — use gcloud, targeting the index by ID:

   ```bash
   # list to find the ID
   gcloud firestore indexes composite list --project maple-and-spruce
   # delete by ID (add --account=<owner> if your active gcloud account lacks access)
   gcloud firestore indexes composite delete <INDEX_ID> --project maple-and-spruce
   ```

Common cause: clicking the auto-create-index URL in a Firestore error message creates an index in prod but not in the file — and Firestore may lay it out with a different `__name__` direction than the declaration, which is what triggers the benign 409 churn. After clicking such a URL, open a tiny PR adding the same index to `firestore.indexes.json`.

The analyzer prevents this gap for **code-derived** queries — it enforces "every required index is declared". It can't see queries that aren't in this repo. Those queries must either be reflected in the file or accepted as ephemeral (and re-added each time prod gets recreated).

### Request-forwarding callers and single-filter indexes

A Cloud Function pattern like:

```typescript
const invoices = await InvoiceRepository.findAll({
  studentId: data.studentId,
  status: data.status,
});
```

passes `data.studentId` / `data.status` — either of which can be `undefined` at runtime. The analyzer treats this as needing not just the all-filters index, but also a `studentId + orderBy` and a `status + orderBy` index, because requests can independently leave either filter unset. This is intentional defensive indexing; the cost is a few extra indexes per repository, the alternative is a hidden outage when a real request comes in with only one filter set.

### Opt-out

If the analyzer flags a query that genuinely doesn't need a declared index (rare — usually only for queries we accept will never run in prod), add this comment on the line immediately above the query:

```typescript
// firestore-index-analyzer-ignore: <reason>
let query = db.collection('foo').where(...)
```

Prefer declaring the index over ignoring; the cost of an unused index is small, the cost of a missing one is a production outage.

## Testing

**Unit tests**: Use `vi.mock()` to mock repositories and external services. See ADR-017 for patterns.

**Integration tests**: Test functions against real Firebase emulators (auth, firestore, functions) with a mock HTTP server for Square/Webflow APIs. See ADR-027.

- Run locally: `./tools/run-integration-tests.sh` (all suites) or `./tools/run-integration-tests.sh square` (one suite)
- Test suites: `apps/functions-integration-tests-{artist,class,instructor,category,discount,calendar,registration,utility,square}/`
- Mock servers: `libs/firebase/{square,webflow,etsy}-test-mock-server/` — per-service mock HTTP servers intercepting SDK calls via `SQUARE_BASE_URL` / `WEBFLOW_BASE_URL` / `ETSY_API_BASE` env vars
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

Each external service has its own mock server library under `libs/firebase/{service}-test-mock-server/`. When adding a new endpoint, add a matching route to the appropriate server's `src/lib/routes/` directory. Current routes:

- **Square** (`libs/firebase/square-test-mock-server/`, port 9997): `POST /v2/orders`, `POST /v2/payments`, `GET /v2/payments/:id`, `POST /v2/refunds`, catalog CRUD, `POST /v2/catalog/images`, `POST /v2/inventory/changes/batch-create`
- **Webflow** (`libs/firebase/webflow-test-mock-server/`, port 9996): CMS item CRUD + publish on `/collections/:id/items`
- **Etsy** (`libs/firebase/etsy-test-mock-server/`, port 9998): listings, OAuth, mock images

## CI/CD Notes

- CI deletes Nx-generated `pnpm-lock.yaml` files from `dist/` before upload. Nx's `generatePackageJson` creates subset lockfiles that miss aliased transitive deps (e.g. `square-legacy`). Removing them lets Firebase Cloud Build do a fresh `pnpm install` with proper resolution.
- Run `./tools/validate-function-tsconfigs.sh` to check that tsconfig includes and `function-codebases.json` mappings are consistent with entry point exports.
- Integration tests run in a separate CI job with Java 21 (required by Firestore emulator). The job builds all 4 codebases, copies `.env.dev` to each, starts per-service mock servers (Square, Webflow, Etsy), and runs `firebase emulators:exec`.

## After Changes

- Update `docs/reference/deployed-functions.md` when adding new functions
- Update `docs/reference/implementation-status.md` when completing features
- Update `function-codebases.json` if the function is not in `maple-core`
- Run `./tools/validate-function-tsconfigs.sh` to catch missing tsconfig includes or codebase mappings
