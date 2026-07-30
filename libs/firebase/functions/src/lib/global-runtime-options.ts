/**
 * Global runtime defaults for every Cloud Function in every codebase.
 *
 * WHY THIS EXISTS
 * ---------------
 * Cloud Run's "Total CPU allocation, per project per region" quota is a
 * reservation ceiling computed from `maxInstances x cpu` across every
 * revision in the region — not from live CPU usage. When `maxInstances`
 * is left unset, gen-2 Cloud Functions inherit the backend default of
 * **100**, so each function reserves up to 100 vCPUs. During a rolling
 * deploy the new revision is created *before* the old one drains, so the
 * codebase being deployed transiently counts twice — which tipped the
 * region over the quota and failed deploys with:
 *
 *   "Quota exceeded for total allowable CPU per project per region."
 *
 * This is an internal admin portal for a small business: a handful of
 * staff plus at most a few simultaneous public checkouts. Nothing here
 * ever needs to fan out to 100 instances. Capping `maxInstances` globally
 * collapses the reservation and gives deploys comfortable headroom.
 *
 * WHY 1 (not 3)
 * -------------
 * The quota is hit *transiently during deploys*, not at idle. Updating a
 * function makes a NEW revision whose reservation stacks on top of the OLD
 * revision until Cloud Run garbage-collects it minutes later, and firebase
 * updates every function in a codebase concurrently. A broad merge that
 * redeploys all ~14 functions in a codebase at once therefore briefly
 * reserves `2 x maxInstances x cpu` for the whole codebase — which at
 * maxInstances=3 kept punching through the region's Total-CPU ceiling
 * (repeated "Quota exceeded" failures on the maple-sync deploy, which has
 * the most functions and deploys last). Dropping the cap to 1 shrinks both
 * the idle baseline AND that deploy-overlap spike ~3x, so a full-codebase
 * redeploy fits under the ceiling without raising the (already large) quota.
 * `concurrency: 80` means a single instance still serves 80 simultaneous
 * requests, so 1 is ample for this portal's real load.
 *
 * ORDERING CONTRACT (IMPORTANT)
 * -----------------------------
 * `onRequest`/`onDocumentWritten`/`onSchedule` read the global options and
 * bake them into the function's `__endpoint` **at definition time**. A
 * codebase entry point re-exports its function modules via
 * `export { x } from '...'`, and those re-exports are evaluated *before*
 * the entry point's own body runs. So this call must execute as an import
 * side-effect that lands *before* the function modules are evaluated.
 *
 * That is why each entry point imports this module on its FIRST line,
 * ahead of every `export { ... } from` re-export. Do not move it below the
 * re-exports, and do not convert it to an exported function called from the
 * entry-point body — either would run too late and silently leave every
 * function at the default of 100.
 *
 * Per-function overrides still work: options passed to `withOptions(...)`
 * (HTTP builder) or directly to a trigger's option object are merged *over*
 * these globals, so a function that genuinely needs more headroom can raise
 * its own `maxInstances`.
 */
import { setGlobalOptions } from 'firebase-functions/v2';

/**
 * Max concurrent instances any single function may scale to. With HTTP
 * functions running `concurrency: 80`, a single instance already absorbs 80
 * simultaneous requests — far beyond this portal's real load. Kept at 1 so
 * the deploy-time reservation overlap (see "WHY 1" above) stays small.
 */
export const GLOBAL_MAX_INSTANCES = 1;

setGlobalOptions({ maxInstances: GLOBAL_MAX_INSTANCES });
