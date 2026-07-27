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
 * collapses the reservation ~33x and gives deploys comfortable headroom.
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
 * functions running `concurrency: 80`, three instances already absorb 240
 * simultaneous requests — far beyond this portal's real load.
 */
export const GLOBAL_MAX_INSTANCES = 3;

setGlobalOptions({ maxInstances: GLOBAL_MAX_INSTANCES });
