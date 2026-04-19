#!/usr/bin/env node

/**
 * Discover all integration-test suite projects and run them sequentially.
 *
 * Usage:
 *   node tools/run-integration-test-suites.js          # run all suites
 *   node tools/run-integration-test-suites.js a,b,c    # run specific suites (comma-separated project names)
 *
 * This replaces the hardcoded command list in the orchestrator project.json,
 * so adding a new integration test suite is zero-config.
 */

const { execSync } = require('child_process');

function main() {
  let suites;

  if (process.argv[2]) {
    // Explicit suite list passed (used by CI matrix jobs)
    suites = process.argv[2].split(',').map((s) => s.trim());
  } else {
    // Discover all suites via Nx
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- CI tooling script, command is a fixed string
    const raw = execSync('pnpm exec nx show projects', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    suites = JSON.parse(raw)
      .filter((name) => name.startsWith('functions-integration-tests-'))
      .sort();
  }

  if (suites.length === 0) {
    console.error('No integration test suites found');
    process.exit(1);
  }

  console.log(`Running ${suites.length} integration test suites:\n`);

  let failed = false;
  for (const suite of suites) {
    console.log(`\n--- ${suite} ---\n`);
    try {
      // eslint-disable-next-line sonarjs/no-os-command-from-path, sonarjs/os-command -- suite names come from Nx project list, not user input
      execSync(`pnpm exec nx run ${suite}:test`, {
        stdio: 'inherit',
      });
    } catch {
      failed = true;
      console.error(`\n*** FAILED: ${suite} ***\n`);
    }
  }

  if (failed) {
    process.exit(1);
  }
}

main();
