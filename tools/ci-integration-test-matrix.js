#!/usr/bin/env node

/**
 * Enumerate integration-test suites via Nx and output a GitHub Actions matrix.
 *
 * Usage:
 *   node tools/ci-integration-test-matrix.js [--max-per-group N] [--affected]
 *
 * Discovers every Nx project matching "functions-integration-tests-*"
 * (excludes the orchestrator "functions-integration-tests"), splits them into
 * groups of at most N (default 5), and prints a JSON object suitable for
 * `fromJson()` in a GitHub Actions matrix strategy.
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

const DEFAULT_MAX = 5;

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

  // Chunk into groups
  const groups = [];
  for (let i = 0; i < suites.length; i += maxPerGroup) {
    groups.push(suites.slice(i, i + maxPerGroup));
  }

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

main();
