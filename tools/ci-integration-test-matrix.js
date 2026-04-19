#!/usr/bin/env node

/**
 * Enumerate integration-test suites via Nx and output a GitHub Actions matrix.
 *
 * Usage:
 *   node tools/ci-integration-test-matrix.js [--max-per-group N]
 *
 * Discovers every Nx project matching "functions-integration-tests-*"
 * (excludes the orchestrator "functions-integration-tests"), splits them into
 * groups of at most N (default 5), and prints a JSON object suitable for
 * `fromJson()` in a GitHub Actions matrix strategy.
 *
 * Output shape:
 *   { "group": [ { "index": 1, "suites": "a,b,c" }, ... ] }
 */

const { execSync } = require('child_process');

const DEFAULT_MAX = 5;

function main() {
  const maxArg = process.argv.indexOf('--max-per-group');
  const maxPerGroup =
    maxArg !== -1 ? parseInt(process.argv[maxArg + 1], 10) : DEFAULT_MAX;

  if (!Number.isFinite(maxPerGroup) || maxPerGroup < 1) {
    console.error('--max-per-group must be a positive integer');
    process.exit(1);
  }

  // Ask Nx for every project name, then filter to integration test suites.
  // `nx show projects` outputs a JSON array.
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- CI tooling script, command is a fixed string
  const raw = execSync('pnpm exec nx show projects', {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // `nx show projects` outputs JSON array in some versions, newline-separated in others
  let allProjects;
  try {
    allProjects = JSON.parse(raw);
  } catch {
    allProjects = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  }
  const suites = allProjects
    .filter(
      (name) =>
        name.startsWith('functions-integration-tests-') &&
        name !== 'functions-integration-tests'
    )
    .sort();

  if (suites.length === 0) {
    console.error('No integration test suites found');
    process.exit(1);
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
