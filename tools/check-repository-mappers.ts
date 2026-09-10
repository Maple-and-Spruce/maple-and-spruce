#!/usr/bin/env npx tsx
/**
 * Repository mapper field ratchet.
 *
 * WHY THIS EXISTS
 * ---------------
 * Adding a field to a domain entity and forgetting it in that entity's
 * `docToX` mapper is silent. The type compiles, because the mapper builds an
 * object literal and every new field is optional. Unit tests pass, because
 * they hand-build entities and never go through the mapper. The value writes
 * to Firestore fine. It just never comes back.
 *
 * It has happened three times:
 *
 *   #798  Student.squareCustomerId / squareCardId  -> every student read back
 *         as "no card", so the billing job skipped everyone.
 *   #835  LessonBlock.onDate                       -> every one-off block read
 *         back as recurring.
 *   #837  StudentLessonSchedule.intervalWeeks      -> every biweekly student
 *         read back as weekly.
 *
 * Each time only an emulator run caught it, and each time the symptom looked
 * like a logic bug somewhere else entirely.
 *
 * WHAT IT CHECKS
 * --------------
 * For every `docTo*` function in `libs/firebase/database/**\/*.repository.ts`,
 * the entity named by its return type must have all of its properties assigned
 * in the returned object literal.
 *
 *   npx tsx tools/check-repository-mappers.ts            # exits non-zero on a gap
 *   npx tsx tools/check-repository-mappers.ts --report   # every mapper + its fields
 *
 * A field that genuinely should not be mapped (derived, deliberately dropped)
 * is declared on the line above the mapper:
 *
 *   // mapper-field-check-ignore: fieldOne, fieldTwo -- why
 *   function docToThing(doc): Thing | undefined {
 *
 * A mapper that spreads (`...data`) is skipped: it maps everything by
 * construction.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

const REPO_ROOT = path.resolve(__dirname, '..');
const DB_DIR = path.join(REPO_ROOT, 'libs/firebase/database/src/lib');
const DOMAIN_DIR = path.join(REPO_ROOT, 'libs/ts/domain/src/lib');

export interface MapperGap {
  file: string;
  mapper: string;
  entity: string;
  missing: string[];
}

function sourceFilesIn(dir: string, suffix: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(suffix) && !e.name.endsWith('.spec.ts')) out.push(p);
    }
  };
  walk(dir);
  return out;
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
}

/**
 * Every entity interface in the domain, with its own and inherited properties.
 *
 * Only `interface` declarations are collected. An entity expressed as a mapped
 * or computed type (`Omit<…>`, a union) has no stable property list to compare
 * against, so those mappers are reported as unresolved rather than guessed at.
 */
function collectDomainInterfaces(domainDir: string): Map<string, Set<string>> {
  const own = new Map<string, string[]>();
  const heritage = new Map<string, string[]>();

  for (const file of sourceFilesIn(domainDir, '.ts')) {
    ts.forEachChild(parse(file), (node) => {
      if (!ts.isInterfaceDeclaration(node)) return;
      const name = node.name.text;
      own.set(
        name,
        node.members
          .filter(ts.isPropertySignature)
          .map((m) => (ts.isIdentifier(m.name) ? m.name.text : ''))
          .filter(Boolean)
      );
      heritage.set(
        name,
        (node.heritageClauses ?? []).flatMap((h) =>
          h.types
            .map((t) => (ts.isIdentifier(t.expression) ? t.expression.text : ''))
            .filter(Boolean)
        )
      );
    });
  }

  const resolved = new Map<string, Set<string>>();
  const resolve = (name: string, seen = new Set<string>()): Set<string> => {
    if (resolved.has(name)) return resolved.get(name)!;
    if (seen.has(name)) return new Set();
    seen.add(name);
    const props = new Set(own.get(name) ?? []);
    for (const parent of heritage.get(name) ?? []) {
      for (const p of resolve(parent, seen)) props.add(p);
    }
    if (own.has(name)) resolved.set(name, props);
    return props;
  };
  for (const name of own.keys()) resolve(name);
  return resolved;
}

/** The entity name a mapper's return type refers to, if it names one. */
function entityFromReturnType(node: ts.FunctionDeclaration): string | undefined {
  const t = node.type;
  if (!t) return undefined;
  const named = (n: ts.TypeNode): string | undefined =>
    ts.isTypeReferenceNode(n) && ts.isIdentifier(n.typeName)
      ? n.typeName.text
      : undefined;
  if (ts.isUnionTypeNode(t)) {
    for (const member of t.types) {
      const n = named(member);
      if (n && n !== 'undefined') return n;
    }
    return undefined;
  }
  return named(t);
}

/** Property names assigned in every object literal this function returns. */
function returnedProperties(
  node: ts.FunctionDeclaration
): { props: Set<string>; spreads: boolean } {
  const props = new Set<string>();
  let spreads = false;

  const visit = (n: ts.Node): void => {
    if (ts.isObjectLiteralExpression(n)) {
      for (const p of n.properties) {
        if (ts.isSpreadAssignment(p)) spreads = true;
        else if (
          (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
          ts.isIdentifier(p.name)
        ) {
          props.add(p.name.text);
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  if (node.body) visit(node.body);
  return { props, spreads };
}

/** Fields declared exempt on the line above the mapper. */
function ignoredFields(file: ts.SourceFile, node: ts.Node): Set<string> {
  const text = file.getFullText();
  const leading = text.slice(node.getFullStart(), node.getStart(file));
  const out = new Set<string>();
  for (const m of leading.matchAll(/mapper-field-check-ignore:\s*([^\n]*)/g)) {
    for (const raw of m[1].split(/[,;]/)) {
      const field = raw.split(/--|—/)[0].trim();
      if (field && /^[A-Za-z_$][\w$]*$/.test(field)) out.add(field);
    }
  }
  return out;
}

export function analyze(
  dbDir: string = DB_DIR,
  domainDir: string = DOMAIN_DIR,
  root: string = REPO_ROOT
): { gaps: MapperGap[]; checked: number; report: string[] } {
  const entities = collectDomainInterfaces(domainDir);
  const gaps: MapperGap[] = [];
  const report: string[] = [];
  let checked = 0;

  for (const file of sourceFilesIn(dbDir, '.repository.ts')) {
    const sf = parse(file);
    const rel = path.relative(root, file);

    ts.forEachChild(sf, (node) => {
      if (!ts.isFunctionDeclaration(node) || !node.name) return;
      if (!node.name.text.startsWith('docTo')) return;

      const entity = entityFromReturnType(node);
      if (!entity) {
        report.push(`${rel}  ${node.name.text}  -> (no named return type, skipped)`);
        return;
      }
      const expected = entities.get(entity);
      if (!expected) {
        report.push(`${rel}  ${node.name.text}  -> ${entity} (not a domain interface, skipped)`);
        return;
      }

      const { props, spreads } = returnedProperties(node);
      if (spreads) {
        report.push(`${rel}  ${node.name.text}  -> ${entity} (spreads, skipped)`);
        return;
      }

      checked++;
      const ignored = ignoredFields(sf, node);
      const missing = [...expected].filter(
        (f) => !props.has(f) && !ignored.has(f)
      );

      report.push(
        `${rel}  ${node.name.text}  -> ${entity}: ${props.size}/${expected.size} mapped` +
          (ignored.size ? `, ${ignored.size} ignored` : '') +
          (missing.length ? `  MISSING ${missing.join(', ')}` : '')
      );

      if (missing.length) {
        gaps.push({ file: rel, mapper: node.name.text, entity, missing });
      }
    });
  }

  return { gaps, checked, report };
}

function main(): void {
  const { gaps, checked, report } = analyze();

  if (process.argv.includes('--report')) {
    report.forEach((l) => console.log(l));
    console.log();
  }

  if (gaps.length === 0) {
    console.log(`✓ All ${checked} repository mappers carry every field of their entity.`);
    return;
  }

  console.error(
    `✗ ${gaps.length} repository mapper(s) drop fields their entity declares.\n`
  );
  console.error(
    'A dropped field writes to Firestore fine and never comes back. This has\n' +
      'shipped three times (#798 card fields, #835 onDate, #837 intervalWeeks)\n' +
      'and each time only an emulator run found it.\n'
  );
  for (const g of gaps) {
    console.error(`  ${g.file}`);
    console.error(`    ${g.mapper} -> ${g.entity} is missing: ${g.missing.join(', ')}`);
  }
  console.error(
    '\nAdd the field to the mapper, or declare it exempt on the line above:\n' +
      '  // mapper-field-check-ignore: fieldName -- why it is not read back\n'
  );
  process.exit(1);
}

if (require.main === module) main();
