#!/usr/bin/env npx tsx
/**
 * One function library deploys exactly one Cloud Function, named after it.
 *
 * WHY
 * ---
 * The merge deploy builds its `--only` filter from the **library directory
 * name**, not from what the library actually exports
 * (`firebase-functions-merge.yml`):
 *
 *     firebase-maple-functions-get-artists  ->  functions:maple-core:getArtists
 *
 * That is a bijection or it is nothing, and it breaks in both directions.
 *
 * **Too few** — a library whose camelCase name matches none of its exports
 * produces a filter naming a function that does not exist, and firebase refuses
 * the whole batch:
 *
 *     Error: No function matches the filter: maple-square:runLessonBilling
 *
 * That is not a partial failure. #835's `run-lesson-billing` library exported
 * `runLessonBillingScheduled` and `triggerLessonBilling`, and took all 26
 * maple-square functions down with it for four retry attempts.
 *
 * **Too many** — every *other* export of a library is outside the filter, so it
 * is left alone: untouched if it already exists, and **never created if it does
 * not**. It does not fail and it does not warn. `chargeLessonsNow` (#866) was
 * added alongside `runLessonBilling` and never came into existence in prod; the
 * Pay-ahead button failed with `functions/not-found`, and the six `trigger*`
 * twins were in the same state (#872).
 *
 * **Neither** — an export declared inline in an entry point has no library
 * behind it at all, so no filter can ever name it. `healthCheck` sat like that.
 *
 * Nothing else catches any of these. They build, they typecheck, the tests pass
 * (the emulator loads the entry point wholesale, so every export exists there),
 * and the entry-point exports are valid TypeScript. The first two fail after
 * merge, at deploy; the third fails nowhere and just never ships.
 *
 *   npx tsx tools/check-function-library-names.ts
 *   npx tsx tools/check-function-library-names.ts --report
 *
 * A function that needs to live next to another one's logic — a scheduled job's
 * admin-callable twin is the usual shape — still gets its own library, and
 * imports what it needs from its sibling across
 * `@maple/firebase/maple-functions/<slug>`.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

const REPO_ROOT = path.resolve(__dirname, '..');
const FUNCTIONS_DIR = path.join(REPO_ROOT, 'libs/firebase/maple-functions');
const MODULE_PREFIX = '@maple/firebase/maple-functions/';

/** `run-lesson-billing` -> `runLessonBilling`, matching the workflow's awk. */
export function camelize(kebab: string): string {
  return kebab
    .split('-')
    .map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('');
}

/** One exported value in an entry point, tagged with the library it came from. */
export interface EntryExport {
  name: string;
  /** Library slug, when re-exported from a maple-functions library. */
  slug?: string;
}

export type Violation =
  | { kind: 'missing'; slug: string; expected: string }
  | { kind: 'extra'; slug: string; expected: string; name: string }
  | { kind: 'orphan'; name: string };

/**
 * Every value a codebase entry point exports, and where it came from.
 *
 * Parsed rather than grepped, because the distinction that matters is which
 * module an export came *from* — and because `runLessonBillingScheduled` must
 * not read as a match for `runLessonBilling` (that is the #835 bug exactly).
 * Type-only exports are skipped: firebase has nothing to deploy for them.
 */
export function parseEntryExports(source: string, fileName = 'index.ts'): EntryExport[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const out: EntryExport[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      if (node.isTypeOnly) return;
      const spec = node.moduleSpecifier;
      const moduleName = spec && ts.isStringLiteral(spec) ? spec.text : undefined;
      const slug = moduleName?.startsWith(MODULE_PREFIX)
        ? moduleName.slice(MODULE_PREFIX.length)
        : undefined;
      for (const el of node.exportClause.elements) {
        if (el.isTypeOnly) continue;
        out.push({ name: el.name.text, slug });
      }
      return;
    }
    // `export const foo = onRequest(...)` written straight into the entry point.
    if (
      ts.isVariableStatement(node) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) out.push({ name: decl.name.text });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/**
 * Check the bijection: every library is exported under its own camelCase name,
 * and nothing else is exported at all.
 */
export function findViolations(
  libSlugs: string[],
  exports: EntryExport[]
): Violation[] {
  const violations: Violation[] = [];
  const exportedBySlug = new Map<string, string[]>();

  for (const { name, slug } of exports) {
    if (!slug) {
      violations.push({ kind: 'orphan', name });
      continue;
    }
    const names = exportedBySlug.get(slug) ?? [];
    names.push(name);
    exportedBySlug.set(slug, names);
  }

  // A slug exported from an entry point with no directory behind it is really a
  // missing library — report it alongside the real ones so nothing is silent.
  const slugs = [...new Set([...libSlugs, ...exportedBySlug.keys()])].sort();

  for (const slug of slugs) {
    const expected = camelize(slug);
    const names = exportedBySlug.get(slug) ?? [];
    if (!names.includes(expected)) {
      violations.push({ kind: 'missing', slug, expected });
    }
    for (const name of names) {
      if (name !== expected) {
        violations.push({ kind: 'extra', slug, expected, name });
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Repo I/O
// ---------------------------------------------------------------------------

/** The entry points, derived from `function-codebases.json` — not a second list to keep in sync. */
function entryPointFiles(): string[] {
  const { codebaseProjects } = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'function-codebases.json'), 'utf8')
  ) as { codebaseProjects: Record<string, string> };
  return Object.values(codebaseProjects).map((project) =>
    path.join(REPO_ROOT, 'apps', project, 'src/index.ts')
  );
}

function main(): void {
  const libs = fs
    .readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  const exports = entryPointFiles().flatMap((file) =>
    parseEntryExports(fs.readFileSync(file, 'utf8'), file)
  );

  if (process.argv.includes('--report')) {
    for (const { name, slug } of exports) {
      console.log(`${(slug ?? '(inline)').padEnd(46)} ${name}`);
    }
    console.log(`\n${exports.length} exports across ${libs.length} libraries\n`);
  }

  const violations = findViolations(libs, exports);

  if (violations.length === 0) {
    console.log(
      `✓ All ${libs.length} function libraries deploy exactly one function, named after the library.`
    );
    return;
  }

  console.error(
    `✗ ${violations.length} deploy-filter violation${violations.length === 1 ? '' : 's'}.\n`
  );
  console.error(
    'The merge deploy names ONE function per library, derived from the library\n' +
      'directory name. Anything else is either a filter pointing at nothing (which\n' +
      'fails the whole codebase batch after merge) or a function no filter names\n' +
      '(which silently never deploys).\n'
  );

  for (const v of violations) {
    switch (v.kind) {
      case 'missing':
        console.error(`  ${v.slug}`);
        console.error(
          `    no function named '${v.expected}' is exported from any codebase entry point.`
        );
        console.error(
          `    -> the deploy filter asks for '${v.expected}' and firebase refuses the batch:`
        );
        console.error(`       Error: No function matches the filter: <codebase>:${v.expected}`);
        break;
      case 'extra':
        console.error(`  ${v.slug} also exports '${v.name}'`);
        console.error(
          `    the filter for this library only names '${v.expected}', so '${v.name}' is never deployed.`
        );
        console.error(
          `    -> give it its own library (libs/firebase/maple-functions/${kebab(v.name)}/)`
        );
        console.error(
          `       and import what it needs from '@maple/firebase/maple-functions/${v.slug}'.`
        );
        break;
      case 'orphan':
        console.error(`  ${v.name} is declared inline in an entry point`);
        console.error(
          `    no library name maps to it, so no deploy filter can ever name it.`
        );
        console.error(
          `    -> move it into libs/firebase/maple-functions/${kebab(v.name)}/ and re-export it.`
        );
        break;
    }
    console.error('');
  }

  process.exit(1);
}

/** `chargeLessonsNow` -> `charge-lessons-now`, for the suggested library path. */
export function kebab(camel: string): string {
  return camel.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

if (require.main === module) main();
