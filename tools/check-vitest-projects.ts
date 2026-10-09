#!/usr/bin/env npx tsx
/**
 * Every unit spec must belong to a Vitest project.
 *
 * Unit tests run per Nx project: each project owns a `vitest.config.mts`, the
 * `@nx/vitest` plugin infers its `test` target, and the root `vitest.config.ts`
 * globs those configs into `test.projects` for CI's merged coverage run.
 *
 * The failure mode is silent. A spec that sits in a directory with no
 * `vitest.config.mts`, or outside its project's `include`, is simply never
 * run: not by `nx test`, not by the root run, and nothing reports it. That is
 * how the Nx 23 migration once dropped ~90 spec files from CI. This check
 * compares the spec files git tracks against the files the root run would
 * actually execute, and fails on any spec left out.
 *
 *   npx tsx tools/check-vitest-projects.ts      # CI runs this
 *
 * Fix an orphan by adding a config to the project that owns it:
 *
 *   pnpm exec nx g @nx/vitest:configuration --project=<name> --testEnvironment=node
 */
import { execFileSync } from 'node:child_process';
import { relative, resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..');

/**
 * Specs that are deliberately NOT unit tests. They run under their own
 * runner or an explicit `--config` (emulator-backed integration suites,
 * Playwright e2e), never as part of the unit projects.
 */
export const NOT_UNIT_SPECS: readonly RegExp[] = [
  /^apps\/functions-integration-tests[^/]*\//,
  /^apps\/pos-sandbox-e2e\//,
  /^apps\/[^/]+-e2e\//,
  /^\.claude\//,
];

const SPEC_FILE = /\.spec\.tsx?$/;

/**
 * Spec files that no Vitest project would run. Pure: the file system and
 * the vitest process live in `main()`.
 */
export function findOrphanSpecs(
  trackedFiles: readonly string[],
  filesVitestRuns: readonly string[],
): string[] {
  const run = new Set(filesVitestRuns);
  return trackedFiles
    .filter((file) => SPEC_FILE.test(file))
    .filter((file) => !NOT_UNIT_SPECS.some((pattern) => pattern.test(file)))
    .filter((file) => !run.has(file))
    .sort();
}

type Exec = (command: string, args: string[]) => string;

const exec: Exec = (command, args) =>
  execFileSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

/**
 * Run the check against the repo. `run` is injectable so the spec can drive
 * it without spawning git and vitest.
 */
export function check(run: Exec = exec): { ok: boolean; message: string } {
  const tracked = run('git', ['ls-files']).split('\n').filter(Boolean);
  const listed: Array<{ file: string }> = JSON.parse(
    run('pnpm', ['exec', 'vitest', 'list', '--filesOnly', '--json']),
  );
  const runs = listed.map(({ file }) => relative(REPO_ROOT, file));

  const orphans = findOrphanSpecs(tracked, runs);
  if (orphans.length > 0) {
    return {
      ok: false,
      message:
        `${orphans.length} spec file(s) are not part of any Vitest project, so ` +
        `neither \`nx test\` nor CI runs them:\n\n` +
        orphans.map((file) => `  ${file}`).join('\n') +
        `\n\nAdd a vitest.config.mts to the project that owns each one:\n` +
        `  pnpm exec nx g @nx/vitest:configuration --project=<name> --testEnvironment=node`,
    };
  }
  return {
    ok: true,
    message: `✓ All ${runs.length} unit spec files belong to a Vitest project.`,
  };
}

if (require.main === module) {
  const result = check();
  if (result.ok) {
    console.log(result.message);
  } else {
    console.error(result.message);
    process.exit(1);
  }
}
