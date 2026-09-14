#!/usr/bin/env node

/**
 * Enumerate integration-test suites via Nx and output a GitHub Actions matrix.
 *
 * Usage:
 *   node tools/ci-integration-test-matrix.js [--max-per-group N] [--affected]
 *
 * Discovers every Nx project matching "functions-integration-tests-*"
 * (excludes the orchestrator "functions-integration-tests"), splits them across
 * shards, and prints a JSON object suitable for `fromJson()` in a GitHub
 * Actions matrix strategy.
 *
 * SHARDS ARE BALANCED BY MEASURED RUNTIME, NOT BY COUNT (#868)
 * -----------------------------------------------------------
 * Chunking alphabetically N-at-a-time treated a 2-second suite and a
 * 138-second suite as equal work. That put `lesson`, `music-together`,
 * `registration` and `invoice` on one shard running ~360s while another ran
 * ~159s — and every suite in a shard shares one emulator, so the last one in
 * the heavy shard (`registration`) began failing with
 * `The operation was aborted due to timeout` from google-gax. Not a broken
 * test: a starved emulator, on a shard carrying twice its share.
 *
 * So `--max-per-group` now sets how many shards there are (the job count, and
 * therefore the runner cost, is unchanged); `ci-integration-suite-weights.json`
 * decides what goes in each. Packing is longest-processing-time-first, the
 * standard greedy approximation: sort by weight descending, and put each suite
 * on whichever shard is currently lightest.
 *
 * With --affected, only includes suites that Nx considers affected by the
 * current change set (requires NX_BASE / NX_HEAD env vars from nrwl/nx-set-shas).
 *
 * Output shape (with suites):
 *   { "group": [ { "index": 1, "total": 3, "suites": "a,b,c" }, ... ] }
 *
 * Output shape (no suites affected):
 *   { "group": [] }
 */

const { execSync } = require('child_process');
const { readFileSync } = require('fs');
const { join } = require('path');

const DEFAULT_MAX = 5;

/**
 * What an unmeasured suite is assumed to cost.
 *
 * Deliberately on the high side of the median: a brand-new suite that turns out
 * to be heavy should crowd a shard rather than quietly overload one, because
 * overloading is the failure that is hard to read.
 */
const DEFAULT_WEIGHT_SECONDS = 40;

function loadWeights() {
  try {
    const raw = readFileSync(
      join(__dirname, 'ci-integration-suite-weights.json'),
      'utf8'
    );
    return JSON.parse(raw).weights ?? {};
  } catch {
    // A missing or malformed weights file must never take CI down — every
    // suite just falls back to the default and packing degrades to roughly
    // what count-based chunking did.
    return {};
  }
}

/** Measured seconds for a suite, by its short name. */
function weightFor(project, weights) {
  const short = project.replace('functions-integration-tests-', '');
  return weights[short] ?? DEFAULT_WEIGHT_SECONDS;
}

/**
 * Longest-processing-time-first bin packing.
 *
 * Exported for the unit test: the property worth pinning is that no shard ends
 * up carrying wildly more than another, which is the thing that broke.
 */
function packByWeight(suites, binCount, weights) {
  const bins = Array.from({ length: binCount }, () => ({ suites: [], load: 0 }));

  const ordered = suites
    .slice()
    .sort((a, b) => {
      const diff = weightFor(b, weights) - weightFor(a, weights);
      // Ties broken by name so the matrix is deterministic across runs —
      // a shard list that reshuffles makes CI logs impossible to compare.
      return diff !== 0 ? diff : a.localeCompare(b);
    });

  for (const suite of ordered) {
    let lightest = bins[0];
    for (const bin of bins) if (bin.load < lightest.load) lightest = bin;
    lightest.suites.push(suite);
    lightest.load += weightFor(suite, weights);
  }

  // Within a shard, run alphabetically — stable ordering keeps one run's log
  // comparable with the next.
  return bins
    .filter((bin) => bin.suites.length > 0)
    .map((bin) => bin.suites.sort());
}

function parseProjects(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    // Nx outputs newline-separated text in some versions
    return raw.split('\n').map((l) => l.trim()).filter(Boolean);
  }
}

function main() {
  const args = process.argv.slice(2);
  const maxArg = args.indexOf('--max-per-group');
  const maxPerGroup =
    maxArg !== -1 ? parseInt(args[maxArg + 1], 10) : DEFAULT_MAX;
  const affected = args.includes('--affected');

  if (!Number.isFinite(maxPerGroup) || maxPerGroup < 1) {
    console.error('--max-per-group must be a positive integer');
    process.exit(1);
  }

  const nxCmd = affected
    ? 'pnpm exec nx show projects --affected'
    : 'pnpm exec nx show projects';

  // eslint-disable-next-line sonarjs/os-command -- CI tooling script, nxCmd is a fixed string (not user input)
  const raw = execSync(nxCmd, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const allProjects = parseProjects(raw);
  const suites = allProjects
    .filter(
      (name) =>
        name.startsWith('functions-integration-tests-') &&
        name !== 'functions-integration-tests'
    )
    .sort();

  if (suites.length === 0) {
    // No suites affected — emit empty matrix so the matrix job is skipped
    console.log(JSON.stringify({ group: [] }));
    return;
  }

  // Keep the shard COUNT that count-based chunking would have produced, so the
  // number of CI jobs (and the fixed per-job emulator boot cost) is unchanged.
  // Only the contents change.
  const binCount = Math.ceil(suites.length / maxPerGroup);
  const groups = packByWeight(suites, binCount, loadWeights());

  const total = groups.length;
  const matrix = {
    group: groups.map((chunk, idx) => ({
      index: idx + 1,
      total,
      suites: chunk.join(','),
    })),
  };

  console.log(JSON.stringify(matrix));
}

module.exports = { packByWeight, weightFor, loadWeights, DEFAULT_WEIGHT_SECONDS };

if (require.main === module) {
  main();
}
