/**
 * How long a spec waits for something a Firestore trigger is supposed to do.
 *
 * Every poll for trigger output (a Meta CAPI event reaching its mock, an
 * invoice appearing, a Webflow item syncing) uses this as its deadline, and
 * returns as soon as the thing shows up. A healthy run pays nothing for a long
 * deadline; only a slow one uses it.
 *
 * WHY 45 SECONDS
 * --------------
 * On a loaded CI runner the functions emulator can stop dispatching triggers
 * for well over ten seconds and then flush the backlog all at once. Observed
 * on 2026-09-14 in shard 3/4: a 16-second stall, then about 45 queued
 * `sendRegistrationConversion` runs in four seconds. The event a test was
 * waiting for was sent four seconds after its 15-second deadline, so the test
 * failed while the code under test was working. Locally the same suite
 * passed every time.
 *
 * The same shape had already bitten `sync-class-to-webflow.spec.ts`, which
 * raised its own deadline to 20 seconds. One shared value stops each spec
 * rediscovering it.
 *
 * NEGATIVE WAITS DO NOT USE THIS. A check that something does NOT happen
 * waits a short, fixed time on purpose; making it 45 seconds would only slow
 * every run down.
 *
 * Suites whose tests poll more than once must keep `testTimeout` above a
 * couple of these (see each suite's `vitest.config.ts`).
 */
export const TRIGGER_WAIT_TIMEOUT_MS = 45_000;

/**
 * `testTimeout` for suites that wait on triggers: room for two full trigger
 * waits plus the test's own calls.
 */
export const TRIGGER_SUITE_TEST_TIMEOUT_MS = 120_000;
