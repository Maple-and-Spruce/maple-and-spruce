#!/usr/bin/env npx tsx
/**
 * Cloud Function count ratchet (ADR-029, epic #724).
 *
 * We deploy one Cloud Run service per function library under
 * `libs/firebase/maple-functions/`. At 215 of them a full deploy needs >=4
 * minutes of pure API writes, because the gen-2 write quota is 60 per 60
 * seconds and CANNOT be increased:
 *   https://docs.cloud.google.com/functions/quotas
 *
 * ADR-029 consolidates endpoints into domain routers to bring that count down.
 * That work spans many PRs, so this guard exists to stop the count drifting
 * back up while it's in flight — otherwise consolidation removes 20 functions
 * while feature work adds 15 and the number never moves.
 *
 * It is a RATCHET, not a ceiling: going *under* the baseline is also a failure,
 * because the win must be committed to `function-count-baseline.json` to be
 * locked in. Both directions are one command to resolve:
 *
 *   npx tsx tools/check-function-count.ts          # check (CI runs this)
 *   npx tsx tools/check-function-count.ts --fix    # write the new baseline
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..');
const FUNCTIONS_DIR = join(REPO_ROOT, 'libs/firebase/maple-functions');
const BASELINE_FILE = join(REPO_ROOT, 'function-count-baseline.json');

export interface Baseline {
  /** Highest allowed number of function libraries. Only ever goes down. */
  maxFunctions: number;
}

export type Verdict =
  | { ok: true; message: string }
  | { ok: false; kind: 'grew' | 'shrank'; message: string };

/**
 * Compare the observed function count against the committed baseline.
 * Pure — the file system lives in `main()`.
 */
export function evaluate(count: number, baseline: number): Verdict {
  if (count > baseline) {
    return {
      ok: false,
      kind: 'grew',
      message:
        `Function count went UP: ${count} (baseline ${baseline}).\n\n` +
        `Adding a new single-purpose Cloud Function contradicts ADR-029 — we are\n` +
        `consolidating endpoints into domain routers (#724) because the gen-2 write\n` +
        `quota (60/60s) cannot be raised and already floors a full deploy at ~4 min.\n\n` +
        `Add the endpoint as a route on the relevant domain router instead. If it\n` +
        `genuinely needs its own function (materially different memory, timeout, or\n` +
        `secrets — see ADR-029 "Consequences"), raise the baseline deliberately:\n` +
        `  npx tsx tools/check-function-count.ts --fix`,
    };
  }

  if (count < baseline) {
    return {
      ok: false,
      kind: 'shrank',
      message:
        `Function count went DOWN: ${count} (baseline ${baseline}). Nice — lock it in:\n` +
        `  npx tsx tools/check-function-count.ts --fix\n\n` +
        `The baseline is a ratchet; committing the drop is what stops the count\n` +
        `creeping back up on a later PR.`,
    };
  }

  return { ok: true, message: `Function count at baseline: ${count}.` };
}

/** Count function libraries (one deployed Cloud Run service each). */
export function countFunctionLibs(dir: string = FUNCTIONS_DIR): number {
  return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory())
    .length;
}

function readBaseline(): number {
  const raw = JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as Baseline;
  if (typeof raw.maxFunctions !== 'number') {
    throw new Error(`${BASELINE_FILE} is missing a numeric "maxFunctions"`);
  }
  return raw.maxFunctions;
}

function main(): void {
  const count = countFunctionLibs();

  if (process.argv.includes('--fix')) {
    const baseline: Baseline = { maxFunctions: count };
    writeFileSync(BASELINE_FILE, `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(`Baseline updated to ${count}.`);
    return;
  }

  const verdict = evaluate(count, readBaseline());
  if (verdict.ok) {
    console.log(verdict.message);
    return;
  }
  console.error(verdict.message);
  process.exit(1);
}

// Only run when invoked directly, so the spec can import the pure helpers.
if (require.main === module) {
  main();
}
