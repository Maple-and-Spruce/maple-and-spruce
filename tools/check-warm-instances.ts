#!/usr/bin/env npx tsx
/**
 * Warm-instance guard: only the `publicSite` router may keep an instance warm.
 *
 * `minInstances: 1` keeps a Cloud Run instance running around the clock, and
 * an idle instance still bills its CPU and memory — about $8 a month for a
 * 1 vCPU / 256MiB function. Five public reads each set it, one PR at a time,
 * until they were nearly the whole ~$40 Cloud Run bill. They now share one warm
 * instance on `publicSite`, and this check stops the pattern coming back.
 *
 * A first-paint read for the Webflow widgets belongs on `publicSite` as a
 * route. If something else genuinely needs its own warm instance, add its file
 * to ALLOWED below with a comment saying what it costs and why.
 *
 *   npx tsx tools/check-warm-instances.ts
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import * as ts from 'typescript';

const REPO_ROOT = resolve(__dirname, '..');
const SCAN_ROOTS = ['libs/firebase/maple-functions', 'apps'];

/** The only files allowed to set `minInstances`, repo-relative. */
export const ALLOWED = new Set([
  // One warm instance shared by every public widget read (~$8/month).
  'libs/firebase/maple-functions/public-site/src/lib/public-site.router.ts',
]);

/**
 * Lines where code (not a comment or a string) names `minInstances`.
 * Pure — reading the file system lives in `main()`.
 */
export function findMinInstances(fileName: string, text: string): number[] {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
  const lines: number[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === 'minInstances') {
      lines.push(source.getLineAndCharacterOfPosition(node.getStart()).line + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return lines;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry) && !/\.(spec|test|stories)\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function main(): void {
  const offenders: string[] = [];
  for (const root of SCAN_ROOTS) {
    for (const file of sourceFiles(join(REPO_ROOT, root))) {
      const rel = relative(REPO_ROOT, file);
      if (ALLOWED.has(rel)) continue;
      for (const line of findMinInstances(rel, readFileSync(file, 'utf8'))) {
        offenders.push(`  ${rel}:${line}`);
      }
    }
  }

  if (offenders.length === 0) {
    console.log('✓ Only publicSite keeps an instance warm.');
    return;
  }
  console.error(
    `minInstances set outside the publicSite router:\n${offenders.join('\n')}\n\n` +
      `An idle warm instance bills ~$8/month per function. Put a first-paint\n` +
      `public read on the publicSite router instead, or, if it truly needs its\n` +
      `own warm instance, allowlist the file in tools/check-warm-instances.ts\n` +
      `with what it costs and why.`
  );
  process.exit(1);
}

// Only run when invoked directly, so the spec can import the pure helper.
if (require.main === module) {
  main();
}
