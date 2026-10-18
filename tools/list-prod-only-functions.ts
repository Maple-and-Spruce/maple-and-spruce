#!/usr/bin/env npx tsx
/**
 * The function libraries that deploy to prod only: every scheduled function.
 *
 * WHY
 * ---
 * Each deployed `onSchedule` function owns a Cloud Scheduler job, and a job is
 * billed whether or not it runs (beyond three free per billing account). Dev
 * carried a copy of every prod job, and spent it doing pointless daily work:
 * reminder sweeps over test classes, a Tally poll every 15 minutes, a billing
 * run with autopay paused.
 *
 * `schedule` is a plain string in firebase-functions, not a param, so a
 * function cannot be scheduled in one project and not the other from code. The
 * only code-level way to drop the dev job is to not deploy the function to dev,
 * so the merge workflow leaves these libraries out of the dev deploy filter
 * (`firebase-functions-merge.yml` -> `dev_matrix`). Every CI deploy goes through
 * that filter, so a later full redeploy cannot bring a dev job back.
 *
 * WHY DERIVED, NOT LISTED
 * -----------------------
 * A list would have to be remembered by whoever adds the next scheduled job,
 * and forgetting it is silent (the job just keeps billing in dev). Detecting it
 * from the import means "dev has no schedules" holds by construction.
 *
 * A library counts when its own (non-spec) source imports from the scheduler
 * provider. The admin-callable twins (`trigger-class-reminders`, ...) import the
 * scheduled library's *logic*, never the scheduler, so they still deploy to
 * dev, and they are how a job is run by hand there.
 *
 *   npx tsx tools/list-prod-only-functions.ts   # one nx project name per line
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

const REPO_ROOT = path.resolve(__dirname, '..');
const FUNCTIONS_DIR = path.join(REPO_ROOT, 'libs/firebase/maple-functions');
const PROJECT_PREFIX = 'firebase-maple-functions-';

const SCHEDULER_MODULES = new Set([
  'firebase-functions/v2/scheduler',
  'firebase-functions/scheduler',
]);

/** Whether a source file imports the scheduler provider (and so defines a scheduled function). */
export function importsScheduler(source: string, fileName = 'file.ts'): boolean {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, false);
  return sf.statements.some(
    (stmt) =>
      ts.isImportDeclaration(stmt) &&
      !stmt.importClause?.isTypeOnly &&
      ts.isStringLiteral(stmt.moduleSpecifier) &&
      SCHEDULER_MODULES.has(stmt.moduleSpecifier.text)
  );
}

function sourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.ts$/.test(entry.name) && !/\.(spec|test)\.ts$/.test(entry.name) ? [full] : [];
  });
}

/** Library slugs under `functionsDir` whose source defines a scheduled function, sorted. */
export function scheduledLibraries(functionsDir = FUNCTIONS_DIR): string[] {
  return fs
    .readdirSync(functionsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((slug) =>
      sourceFiles(path.join(functionsDir, slug, 'src')).some((file) =>
        importsScheduler(fs.readFileSync(file, 'utf8'), file)
      )
    )
    .sort();
}

if (require.main === module) {
  for (const slug of scheduledLibraries()) {
    console.log(`${PROJECT_PREFIX}${slug}`);
  }
}
