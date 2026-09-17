#!/usr/bin/env npx tsx
/**
 * Rewrite issue and PR numbers from the old repository.
 *
 * WHY
 * ---
 * In 2026-09 the repo was rebuilt from a history-rewritten copy in the
 * Maple-and-Spruce org (see docs/guides/public-repo-migration.md). Issue and
 * PR numbers start again at 1 there, so every `#798` written before the move
 * now names, or will one day name, a different issue.
 *
 * - An open issue that was recreated becomes its new number: `#798` → `#12`.
 * - Anything else becomes `legacy #798`, which
 *   docs/reference/legacy-issues.md resolves to a title.
 *
 * WHICH LINES
 * -----------
 * Old and new numbers look identical, so the tool cannot tell them apart from
 * the text. It goes by age instead: with `--base <rev>`, only lines unchanged
 * since that revision are touched. Every line written since the move already
 * uses new numbers. A line that still refers to an issue waiting to be
 * recreated is left alone entirely, so no line is ever half converted; once a
 * line is rewritten it no longer counts as unchanged, so running the tool
 * again is safe.
 *
 *   npx tsx tools/rewrite-legacy-issue-refs.ts --base d4eb16f          # dry run
 *   npx tsx tools/rewrite-legacy-issue-refs.ts --base d4eb16f --write
 *   npx tsx tools/rewrite-legacy-issue-refs.ts --table   # regenerate the lookup doc
 *
 * Without `--base`, every line is treated as old. That is for porting a branch
 * cut from the old repository before rebasing it: all of its text is old.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..');
export const MAP_FILE = path.join(REPO_ROOT, 'tools/legacy-issue-map.json');
const TABLE_FILE = path.join(REPO_ROOT, 'docs/reference/legacy-issues.md');

export interface LegacyItem {
  kind: 'issue' | 'pr';
  state: 'open' | 'closed' | 'merged';
  title: string;
  /** Set once the issue has been recreated in the new repository. */
  newNumber?: number;
  /** True while the issue is planned to be recreated but has not been yet. */
  pending?: boolean;
  /** Held back by the PII guard until a human decides what to do with it. */
  blocked?: boolean;
}

export interface LegacyMap {
  newRepo: string;
  items: Record<string, LegacyItem>;
}

export type Resolution = { to: 'new'; n: number } | { to: 'legacy' } | { to: 'pending' } | { to: 'unknown' };

export function resolve(map: LegacyMap, n: number): Resolution {
  const item = map.items[String(n)];
  if (!item) return { to: 'unknown' };
  if (item.newNumber) return { to: 'new', n: item.newNumber };
  if (item.pending) return { to: 'pending' };
  return { to: 'legacy' };
}

const OLD_URL = String.raw`https?://github\.com/(?:david-shortman|Maple-and-Spruce)/maple-and-spruce/(?:issues|pull)/(\d+)`;

/** `[#113](https://github.com/<old>/issues/113)`: the link text is the number. */
const MD_LINK = new RegExp(String.raw`\[#?(\d+)\]\(${OLD_URL}\)`, 'gi');
const BARE_URL = new RegExp(OLD_URL, 'gi');
/**
 * `#123` as its own token: not part of a word, an HTML entity (`&#123;`), a
 * URL fragment or a CSS colour inside quotes, and not already `legacy #123`.
 */
const HASH_REF =
  /(?<![A-Za-z0-9&/#_'"`-])(?<!legacy (?:(?:PR|[Ii]ssue|[Ee]pic) )?)(?:(PR|[Ii]ssue|[Ee]pic) )?#(\d{1,4})(?![0-9A-Za-z_-])/g;

/**
 * Rewrite one line. Returns it unchanged when there is nothing to do, or when
 * any reference in it is still pending.
 */
export function rewriteLine(line: string, map: LegacyMap): string {
  const newUrl = (n: number): string => `https://github.com/${map.newRepo}/issues/${n}`;
  let pending = false;

  const check = (n: number): Resolution => {
    const r = resolve(map, n);
    if (r.to === 'pending') pending = true;
    return r;
  };

  let out = line.replace(MD_LINK, (whole, _text: string, num: string) => {
    const r = check(Number(num));
    if (r.to === 'new') return `[#${r.n}](${newUrl(r.n)})`;
    if (r.to === 'legacy') return `legacy #${num}`;
    return whole;
  });

  out = out.replace(BARE_URL, (whole, num: string) => {
    const r = check(Number(num));
    if (r.to === 'new') return newUrl(r.n);
    if (r.to === 'legacy') return `legacy #${num}`;
    return whole;
  });

  out = out.replace(
    HASH_REF,
    (whole, noun: string | undefined, num: string, offset: number, all: string) => {
      // A colour like `color: #333`, not an issue.
      if (!noun && /[:=]\s*$/.test(all.slice(0, offset))) return whole;
      const r = check(Number(num));
      const lead = noun ? `${noun} ` : '';
      // "PR #725" reads as "legacy PR #725", not "PR legacy #725".
      if (r.to === 'new') return `${lead}#${r.n}`;
      if (r.to === 'legacy') return `legacy ${lead}#${num}`;
      return whole;
    }
  );

  return pending ? line : out;
}

/**
 * Line numbers (1-based) unchanged since `base`. With a `base..HEAD` range,
 * `git blame` attributes those lines to a "boundary" commit. Porcelain output
 * prints `boundary` once per commit, under the first line that commit owns,
 * so this collects the boundary commits first and then their lines.
 */
export function parseBoundaryLines(porcelain: string): Set<number> {
  const lines = porcelain.split('\n');
  const header = /^([0-9a-f]{40}) \d+ (\d+)/;
  const boundary = new Set<string>();
  let sha = '';
  for (const l of lines) {
    const h = header.exec(l);
    if (h) sha = h[1];
    else if (l === 'boundary') boundary.add(sha);
  }
  const old = new Set<number>();
  for (const l of lines) {
    const h = header.exec(l);
    if (h && boundary.has(h[1])) old.add(Number(h[2]));
  }
  return old;
}

export function linesUnchangedSince(file: string, base: string, cwd: string = REPO_ROOT): Set<number> {
  const out = execFileSync(
    // A local dev tool: `git` from the developer's own PATH is the point.
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    'git',
    // --contents: blame the file as it is on disk, so lines rewritten but not
    // yet committed count as new. Without it, blame reads HEAD, and a second
    // uncommitted run would take the new numbers for old ones.
    ['blame', '--porcelain', '--contents', file, `${base}..HEAD`, '--', file],
    { cwd, maxBuffer: 256 * 1024 * 1024 }
  ).toString();
  return parseBoundaryLines(out);
}

const SKIP = /(^|\/)(pnpm-lock\.yaml|legacy-issue-map\.json|legacy-issues\.md)$|\.(png|jpe?g|gif|svg|ico|woff2?|ttf)$/;

function trackedFiles(): string[] {
  // eslint-disable-next-line sonarjs/no-os-command-from-path
  return execFileSync('git', ['ls-files', '-z'], { cwd: REPO_ROOT })
    .toString()
    .split('\0')
    .filter((f) => f && !SKIP.test(f));
}

/** The lookup doc: what every `legacy #N` was, and where it went if it moved. */
export function renderTable(map: LegacyMap): string {
  const cell = (t: string): string => t.replace(/\|/g, '\\|').replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;'));
  const rows = Object.entries(map.items)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([n, it]) => {
      const now = it.newNumber ? `#${it.newNumber}` : it.pending ? 'moving' : '';
      return `| ${n} | ${it.kind === 'pr' ? 'PR' : 'issue'} | ${it.state} | ${cell(it.title)} | ${now} |`;
    });
  return [
    '# Legacy issues and PRs',
    '',
    '> Generated by `tools/rewrite-legacy-issue-refs.ts --table` from',
    '> `tools/legacy-issue-map.json`. Do not edit by hand.',
    '',
    'Issue and PR numbers restarted when the repo moved to',
    `\`${map.newRepo}\` in 2026-09 (see \`docs/guides/public-repo-migration.md\`).`,
    'Anything written before the move as `#N` now reads `legacy #N`; look it up here.',
    'Open issues were recreated, and the last column gives their new number.',
    'Commit messages from before the move still say `(#N)`: those are legacy numbers too.',
    '',
    '| Legacy # | Kind | State | Title | Now |',
    '|---:|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes('--table')) {
    const m: LegacyMap = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
    fs.writeFileSync(TABLE_FILE, renderTable(m));
    console.log(`Wrote ${path.relative(REPO_ROOT, TABLE_FILE)}`);
    return;
  }
  const write = args.includes('--write');
  const baseIdx = args.indexOf('--base');
  const base = baseIdx >= 0 ? args[baseIdx + 1] : undefined;
  const map: LegacyMap = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));

  let changedLines = 0;
  let changedFiles = 0;
  let pendingLines = 0;
  for (const file of trackedFiles()) {
    const full = path.join(REPO_ROOT, file);
    const buf = fs.readFileSync(full);
    if (buf.includes(0)) continue;
    const text = buf.toString('utf8');
    if (!/#\d|maple-and-spruce\/(issues|pull)\//.test(text)) continue;

    const old = base ? linesUnchangedSince(file, base) : undefined;
    const lines = text.split('\n');
    let touched = false;
    lines.forEach((line, i) => {
      if (old && !old.has(i + 1)) return;
      const next = rewriteLine(line, map);
      if (next !== line) {
        lines[i] = next;
        touched = true;
        changedLines++;
        if (!write) console.log(`${file}:${i + 1}\n  - ${line.trim()}\n  + ${next.trim()}`);
      } else if (rewriteLine(line, { ...map, items: withoutPending(map.items) }) !== line) {
        pendingLines++;
      }
    });
    if (touched) {
      changedFiles++;
      if (write) fs.writeFileSync(full, lines.join('\n'));
    }
  }
  console.log(
    `${write ? 'Rewrote' : 'Would rewrite'} ${changedLines} line(s) in ${changedFiles} file(s); ` +
      `${pendingLines} line(s) wait on issues not yet recreated.`
  );
}

function withoutPending(items: LegacyMap['items']): LegacyMap['items'] {
  return Object.fromEntries(Object.entries(items).map(([k, v]) => [k, { ...v, pending: false }]));
}

if (require.main === module) main();
