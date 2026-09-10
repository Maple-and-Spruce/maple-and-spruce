#!/usr/bin/env npx tsx
/**
 * Every function library must export a function named after itself.
 *
 * WHY
 * ---
 * The merge deploy derives its filter from the **library directory name**, not
 * from what the library actually exports (`firebase-functions-merge.yml`):
 *
 *     firebase-maple-functions-get-artists  ->  functions:maple-core:getArtists
 *
 * So a library whose camelCase name matches none of its exported functions
 * produces a filter naming a function that does not exist, and firebase
 * refuses the whole batch:
 *
 *     Error: No function matches the filter: maple-square:runLessonBilling
 *
 * That is not a partial failure. Every other function in that codebase's batch
 * fails with it — #835's `run-lesson-billing` library exported
 * `runLessonBillingScheduled` and `triggerLessonBilling`, and took all 26
 * maple-square functions down with it for four retry attempts.
 *
 * Nothing else catches this. It builds, it passes every test, the entry point
 * exports are valid TypeScript. It only fails at deploy, after merge.
 *
 *   npx tsx tools/check-function-library-names.ts
 *   npx tsx tools/check-function-library-names.ts --report
 *
 * A library may export more functions than its name (a scheduled job plus its
 * admin trigger twin is the common shape). It just has to export that one too,
 * because that is the only name the deploy filter will ask for.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..');
const FUNCTIONS_DIR = path.join(REPO_ROOT, 'libs/firebase/maple-functions');
const APPS_DIR = path.join(REPO_ROOT, 'apps');

/** `run-lesson-billing` -> `runLessonBilling`, matching the workflow's awk. */
export function camelize(kebab: string): string {
  return kebab
    .split('-')
    .map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('');
}

function entryPointSources(): string {
  return fs
    .readdirSync(APPS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('functions'))
    .map((e) => path.join(APPS_DIR, e.name, 'src/index.ts'))
    .filter((p) => fs.existsSync(p))
    .map((p) => fs.readFileSync(p, 'utf8'))
    .join('\n');
}

export function findUnexported(
  libNames: string[],
  entrySource: string
): { lib: string; expected: string }[] {
  return libNames
    .map((lib) => ({ lib, expected: camelize(lib) }))
    // Word-boundary match so `runLessonBilling` is not satisfied by
    // `runLessonBillingScheduled` — the filter asks for the exact name.
    .filter(({ expected }) => !new RegExp(`\\b${expected}\\b`).test(entrySource));
}

function main(): void {
  const libs = fs
    .readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  const source = entryPointSources();
  const bad = findUnexported(libs, source);

  if (process.argv.includes('--report')) {
    libs.forEach((l) => console.log(`${l} -> ${camelize(l)}`));
    console.log();
  }

  if (bad.length === 0) {
    console.log(`✓ All ${libs.length} function libraries export their own name.`);
    return;
  }

  console.error(
    `✗ ${bad.length} function librar${bad.length === 1 ? 'y' : 'ies'} export no function matching the library name.\n`
  );
  console.error(
    'The merge deploy builds its filter from the library directory name, so\n' +
      'this fails AFTER merge, at deploy, and takes the whole codebase batch\n' +
      'down with it:\n\n' +
      '    Error: No function matches the filter: <codebase>:<name>\n'
  );
  for (const { lib, expected } of bad) {
    console.error(`  ${lib}`);
    console.error(`    no function named '${expected}' is exported from any apps/functions*/src/index.ts`);
  }
  console.error(
    '\nRename the exported function to match the library, or rename the library\n' +
      'to match its primary function. A library may export others besides.\n'
  );
  process.exit(1);
}

if (require.main === module) main();
