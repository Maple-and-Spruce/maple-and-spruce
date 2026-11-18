#!/usr/bin/env npx tsx
/**
 * Security audit automation. Two callers:
 *
 *   1. The PR "Security Audit" job (build-check.yml):
 *        npx tsx tools/security-autofix.ts pr-check --base <sha>
 *      Fails only on high/critical advisories the PR itself ADDS. Advisories
 *      already on the base branch are reported as warnings, not failures:
 *      a CVE published overnight used to red-X whatever PR happened to be
 *      open, however unrelated. Fixing those is the daily job's work.
 *
 *   2. The daily fixer (security-autofix.yml):
 *        npx tsx tools/security-autofix.ts audit --out before.json
 *        npx tsx tools/security-autofix.ts gate --base origin/main \
 *          --before before.json --after after.json
 *      `gate` decides whether the fix PR may merge itself. See evaluateGate.
 *
 *   3. The daily look at what we chose to live with (security-autofix.yml):
 *        npx tsx tools/security-autofix.ts recheck-accepted
 *      An id in `auditConfig.ignoreGhsas` is invisible to `pnpm audit` from
 *      then on, so nothing above ever looks at it again. This fails once a
 *      patched release ships, or once the entry no longer matches anything
 *      installed. See evaluateAccepted.
 *
 * Dependabot is not the source here: it reports no alerts for this repo
 * (it cannot read the pnpm 11+ lockfile), so `pnpm audit` is the truth.
 *
 * `pnpm audit` talks to the npm advisories endpoint, which times out often.
 * A registry error is retried, then reported as "unreachable" (exit 3) so it
 * is never mistaken for a clean audit or for a real advisory.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export interface Advisory {
  id: string; // GHSA id
  module: string;
  severity: 'high' | 'critical';
  title: string;
  url: string;
  patched: string;
}

/** Files the fixer is allowed to touch. Anything else needs a human. */
export const MANIFEST_PATTERN = /(^|\/)(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml)$/;

const AUDIT_ATTEMPTS = Number(process.env.AUDIT_ATTEMPTS ?? 3);
const AUDIT_BACKOFF_MS = Number(process.env.AUDIT_BACKOFF_SECONDS ?? 10) * 1000;

// ---------------------------------------------------------------- parsing --

/**
 * High/critical advisories from `pnpm audit --json`, deduped by GHSA id.
 * Returns null when the output is not an audit report (registry error).
 */
export function parseAuditReport(raw: string): Advisory[] | null {
  let report: unknown;
  try {
    report = JSON.parse(raw);
  } catch {
    return null;
  }
  const advisories = (report as { advisories?: Record<string, RawAdvisory> })
    ?.advisories;
  if (!advisories || typeof advisories !== 'object') return null;

  const byId = new Map<string, Advisory>();
  for (const a of Object.values(advisories)) {
    if (a.severity !== 'high' && a.severity !== 'critical') continue;
    const id = a.github_advisory_id || `npm-${a.id}`;
    if (byId.has(id)) continue;
    byId.set(id, {
      id,
      module: a.module_name,
      severity: a.severity,
      title: a.title,
      url: a.url,
      patched: a.patched_versions,
    });
  }
  return [...byId.values()].sort((x, y) => x.id.localeCompare(y.id));
}

interface RawAdvisory {
  id: number;
  github_advisory_id?: string;
  module_name: string;
  severity: string;
  title: string;
  url: string;
  patched_versions: string;
}

export function diffAdvisories(
  base: Advisory[],
  head: Advisory[],
): { added: Advisory[]; fixed: Advisory[]; remaining: Advisory[] } {
  const baseIds = new Set(base.map((a) => a.id));
  const headIds = new Set(head.map((a) => a.id));
  return {
    added: head.filter((a) => !baseIds.has(a.id)),
    fixed: base.filter((a) => !headIds.has(a.id)),
    remaining: head.filter((a) => baseIds.has(a.id)),
  };
}

/**
 * name -> set of resolved versions, from the `packages:` section of a
 * pnpm v9 lockfile. Keys look like `foo@1.2.3:` or `'@scope/foo@1.2.3':`.
 */
export function parseLockVersions(lock: string): Map<string, Set<string>> {
  const versions = new Map<string, Set<string>>();
  let inPackages = false;
  for (const line of lock.split('\n')) {
    if (/^\S/.test(line)) {
      inPackages = line.startsWith('packages:');
      continue;
    }
    if (!inPackages) continue;
    const m = /^ {2}'?(@?[^@\s']+)@([^(':\s]+)/.exec(line);
    if (!m) continue;
    const [, name, version] = m;
    if (!versions.has(name)) versions.set(name, new Set());
    versions.get(name)!.add(version);
  }
  return versions;
}

/**
 * The part of a version that signals breaking change under semver:
 * the major, or major.minor while the major is 0. `^7.29.7` -> "7",
 * `0.4.1` -> "0.4". Returns null for non-registry specs (workspace:, git).
 */
export function breakingKey(spec: string): string | null {
  const m = /(\d+)(?:\.(\d+))?/.exec(spec);
  if (!m || /^(workspace|link|file|git|github|https?):/.test(spec)) return null;
  return m[1] === '0' ? `0.${m[2] ?? '0'}` : m[1];
}

export interface VersionJump {
  name: string;
  from: string;
  to: string;
}

/**
 * Packages whose breaking-version key changed. A lockfile entry counts when a
 * package had exactly one version before and after (the common case), so a
 * package that simply gains a second copy is not misread as a jump.
 */
export function majorJumps(
  before: Map<string, Set<string>>,
  after: Map<string, Set<string>>,
): VersionJump[] {
  const jumps: VersionJump[] = [];
  for (const [name, afterSet] of after) {
    const beforeSet = before.get(name);
    if (!beforeSet) continue;
    const beforeKeys = new Set([...beforeSet].map(breakingKey));
    for (const v of afterSet) {
      if (beforeSet.has(v)) continue;
      const key = breakingKey(v);
      if (key !== null && !beforeKeys.has(key)) {
        jumps.push({ name, from: [...beforeSet].join(', '), to: v });
      }
    }
  }
  return jumps;
}

export function directDependencyJumps(
  beforePkg: string,
  afterPkg: string,
): VersionJump[] {
  const deps = (raw: string): Record<string, string> => {
    const pkg = JSON.parse(raw) as Record<string, Record<string, string>>;
    return {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.optionalDependencies,
    };
  };
  const before = deps(beforePkg);
  const after = deps(afterPkg);
  const jumps: VersionJump[] = [];
  for (const [name, to] of Object.entries(after)) {
    const from = before[name];
    if (from === undefined || from === to) continue;
    if (breakingKey(from) !== breakingKey(to)) jumps.push({ name, from, to });
  }
  return jumps;
}

// ------------------------------------------------------------------- gate --

export interface GateInput {
  changedFiles: string[];
  before: Advisory[];
  after: Advisory[];
  lockJumps: VersionJump[];
  directJumps: VersionJump[];
}

export interface GateVerdict {
  automerge: boolean;
  reasons: string[];
}

/**
 * May the fix PR merge itself once CI is green? Only when the change is the
 * kind a person would wave through without reading:
 *   - it touches dependency manifests and nothing else,
 *   - it fixes at least one advisory and adds none,
 *   - nothing crosses a major version (direct or transitive).
 * Anything else is opened for review instead.
 */
export function evaluateGate(input: GateInput): GateVerdict {
  const reasons: string[] = [];
  const other = input.changedFiles.filter((f) => !MANIFEST_PATTERN.test(f));
  if (input.changedFiles.length === 0) reasons.push('No files changed.');
  if (other.length > 0) {
    reasons.push(`Changes files other than dependency manifests: ${other.join(', ')}`);
  }

  const { added, fixed } = diffAdvisories(input.before, input.after);
  if (fixed.length === 0) reasons.push('Fixes no advisory.');
  if (added.length > 0) {
    reasons.push(`Introduces advisories: ${added.map((a) => a.id).join(', ')}`);
  }

  for (const j of input.directJumps) {
    reasons.push(`Major bump of direct dependency ${j.name}: ${j.from} -> ${j.to}`);
  }
  for (const j of input.lockJumps) {
    reasons.push(`Major bump of ${j.name}: ${j.from} -> ${j.to}`);
  }

  return { automerge: reasons.length === 0, reasons };
}

// ------------------------------------------------------ accepted advisories --

/** GHSA ids under `auditConfig.ignoreGhsas` in pnpm-workspace.yaml. */
export function parseIgnoredGhsas(workspaceYaml: string): string[] {
  const ids: string[] = [];
  let inList = false;
  for (const line of workspaceYaml.split('\n')) {
    if (/^\s*ignoreGhsas:\s*$/.test(line)) {
      inList = true;
      continue;
    }
    if (!inList) continue;
    if (/^\s*(#.*)?$/.test(line)) continue;
    const m = /^\s+-\s+['"]?(GHSA-[0-9a-z-]+)/i.exec(line);
    if (!m) break;
    ids.push(m[1]);
  }
  return ids;
}

type Version = [number, number, number, string];

function parseVersion(v: string): Version | null {
  const m = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?/.exec(v.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0), m[4] ?? ''];
}

/** Semver order. A prerelease sorts below its release; that is all we need. */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return (x[i] as number) < (y[i] as number) ? -1 : 1;
  }
  if (x[3] === y[3]) return 0;
  if (x[3] === '') return 1;
  if (y[3] === '') return -1;
  return x[3] < y[3] ? -1 : 1;
}

/**
 * Is `version` inside a GitHub advisory range such as `>= 4.0.0, < 4.0.8`,
 * `<= 4.0.7` or `= 1.2.3`? An unreadable range counts as a match: when in
 * doubt the installed copy is still treated as affected.
 */
export function inVulnerableRange(version: string, range: string): boolean {
  if (!parseVersion(version)) return true;
  return range
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .every((part) => {
      const m = /^(<=|>=|<|>|=)?\s*(\S+)$/.exec(part);
      if (!m || !parseVersion(m[2])) return true;
      const c = compareVersions(version, m[2]);
      switch (m[1] ?? '=') {
        case '<':
          return c < 0;
        case '<=':
          return c <= 0;
        case '>':
          return c > 0;
        case '>=':
          return c >= 0;
        default:
          return c === 0;
      }
    });
}

/** One affected-package entry of a GitHub advisory, trimmed to what we use. */
export interface AdvisoryRange {
  package: string;
  range: string;
  firstPatched: string | null;
}

export interface AcceptedAdvisory {
  withdrawn: boolean;
  ranges: AdvisoryRange[];
}

export type AcceptedStatus = 'waiting' | 'fixable' | 'partly-fixable' | 'stale';

export interface AcceptedVerdict {
  id: string;
  status: AcceptedStatus;
  /** One sentence for the log and the job summary. */
  detail: string;
}

/**
 * Should an accepted advisory still be accepted?
 *
 *   waiting         an affected copy is installed and nothing can be done yet
 *   fixable         every affected copy has a patched release in its own major
 *   partly-fixable  some do, some do not (one major line patched, another not)
 *   stale           no affected copy is installed, or the advisory was withdrawn
 *
 * "In its own major" is the same line the gate draws: a patch that exists
 * only across a major version is not a fix the daily job is allowed to take,
 * so it does not end the wait.
 */
export function evaluateAccepted(
  id: string,
  advisory: AcceptedAdvisory,
  installed: Map<string, Set<string>>,
): AcceptedVerdict {
  if (advisory.withdrawn) {
    return { id, status: 'stale', detail: 'The advisory was withdrawn.' };
  }
  const fixable: string[] = [];
  const stuck: string[] = [];
  for (const r of advisory.ranges) {
    const affected = [...(installed.get(r.package) ?? [])].filter((v) =>
      inVulnerableRange(v, r.range),
    );
    for (const version of affected) {
      const copy = `${r.package} ${version}`;
      if (r.firstPatched === null) stuck.push(copy);
      else if (breakingKey(r.firstPatched) === breakingKey(version)) {
        fixable.push(`${copy} -> ${r.firstPatched}`);
      } else stuck.push(`${copy} (patched only in ${r.firstPatched}, a different major)`);
    }
  }
  if (fixable.length === 0 && stuck.length === 0) {
    return { id, status: 'stale', detail: 'No affected version is installed any more.' };
  }
  if (fixable.length === 0) {
    return { id, status: 'waiting', detail: `No patched release to move to for ${stuck.join(', ')}.` };
  }
  if (stuck.length === 0) {
    return { id, status: 'fixable', detail: `A patched release exists: ${fixable.join(', ')}.` };
  }
  return {
    id,
    status: 'partly-fixable',
    detail: `A patched release exists for ${fixable.join(', ')}, but not for ${stuck.join(', ')}.`,
  };
}

const ACCEPTED_ACTION: Record<Exclude<AcceptedStatus, 'waiting'>, string> = {
  fixable:
    'Delete its entry from auditConfig.ignoreGhsas in pnpm-workspace.yaml; the next daily run then fixes it like any other advisory.',
  'partly-fixable':
    'Keep its entry in auditConfig.ignoreGhsas, add a scoped override in pnpm-workspace.yaml for the line that has a patch, and update the comment.',
  stale: 'Delete its entry from auditConfig.ignoreGhsas in pnpm-workspace.yaml.',
};

interface RawGithubAdvisory {
  withdrawn_at?: string | null;
  vulnerabilities?: {
    package?: { ecosystem?: string; name?: string };
    vulnerable_version_range?: string;
    first_patched_version?: string | null;
  }[];
}

export function toAcceptedAdvisory(raw: RawGithubAdvisory): AcceptedAdvisory {
  return {
    withdrawn: Boolean(raw.withdrawn_at),
    ranges: (raw.vulnerabilities ?? []).flatMap((v) => {
      const name = v.package?.ecosystem === 'npm' ? v.package.name : undefined;
      if (!name) return [];
      return [
        {
          package: name,
          range: v.vulnerable_version_range ?? '',
          firstPatched: v.first_patched_version ?? null,
        },
      ];
    }),
  };
}

/** null = GitHub did not answer; never read as "nothing to do". */
async function fetchAdvisory(id: string): Promise<AcceptedAdvisory | null> {
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  try {
    const res = await fetch(`https://api.github.com/advisories/${id}`, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'security-autofix',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    return toAcceptedAdvisory((await res.json()) as RawGithubAdvisory);
  } catch {
    return null;
  }
}

async function recheckAccepted(): Promise<void> {
  const ids = parseIgnoredGhsas(readFileSync('pnpm-workspace.yaml', 'utf8'));
  const installed = parseLockVersions(readFileSync('pnpm-lock.yaml', 'utf8'));
  const verdicts: AcceptedVerdict[] = [];
  const unanswered: string[] = [];
  for (const id of ids) {
    const advisory = await fetchAdvisory(id);
    if (!advisory) {
      unanswered.push(id);
      continue;
    }
    verdicts.push(evaluateAccepted(id, advisory, installed));
  }

  for (const id of unanswered) {
    console.log(
      `::warning title=Could not look up ${id}::GitHub did not return the advisory, so it was not rechecked today.`,
    );
  }
  const rows = verdicts.map((v) => `| ${v.id} | ${v.status} | ${v.detail} |`);
  summary(
    ['### Accepted advisories', '', '| Advisory | Status | Detail |', '|---|---|---|', ...rows].join('\n'),
  );

  let failed = false;
  for (const v of verdicts) {
    if (v.status === 'waiting') {
      console.log(`${v.id}: still waiting. ${v.detail}`);
      continue;
    }
    failed = true;
    console.log(
      `::error title=Accepted advisory ${v.id} is ${v.status}::${v.detail} ${ACCEPTED_ACTION[v.status]}`,
    );
  }
  if (failed) process.exit(1);
  console.log(`${verdicts.length} accepted advisories rechecked; none can move yet.`);
}

// ---------------------------------------------------------------- running --

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Audit a directory. null = the registry never answered. */
export function runAudit(dir: string): Advisory[] | null {
  for (let attempt = 1; attempt <= AUDIT_ATTEMPTS; attempt++) {
    const res = spawnSync(
      // eslint-disable-next-line sonarjs/no-os-command-from-path -- pnpm from PATH
      'pnpm',
      ['audit', '--json', '--ignore-registry-errors'],
      { cwd: dir, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
    );
    const parsed = parseAuditReport(res.stdout ?? '');
    if (parsed) return parsed;
    if (attempt < AUDIT_ATTEMPTS) {
      console.error(
        `Audit registry error (attempt ${attempt}/${AUDIT_ATTEMPTS}); retrying...`,
      );
      sleep(AUDIT_BACKOFF_MS);
    }
  }
  return null;
}

function git(...args: string[]): string {
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- git from PATH
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

function changedFiles(base: string): string[] {
  return git('diff', '--name-only', base, '--')
    .split('\n')
    .filter(Boolean);
}

/** Write the base ref's manifests into a temp dir so it can be audited. */
function auditRef(ref: string): Advisory[] | null {
  const dir = mkdtempSync(join(tmpdir(), 'audit-base-'));
  try {
    const files = git('ls-tree', '-r', '--name-only', ref)
      .split('\n')
      .filter((f) => MANIFEST_PATTERN.test(f) && !f.includes('node_modules'));
    for (const f of files) {
      mkdirSync(dirname(join(dir, f)), { recursive: true });
      writeFileSync(join(dir, f), git('show', `${ref}:${f}`));
    }
    return runAudit(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function summary(markdown: string): void {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) appendFileSync(file, `${markdown}\n`);
}

function output(name: string, value: string): void {
  const file = process.env.GITHUB_OUTPUT;
  if (file) appendFileSync(file, `${name}<<__EOF__\n${value}\n__EOF__\n`);
}

const line = (a: Advisory): string =>
  `- **${a.severity}** \`${a.module}\` [${a.id}](${a.url}): ${a.title} (fixed in ${a.patched})`;

function unreachable(): never {
  const msg =
    'pnpm audit could not reach the npm advisories endpoint, so no audit ran. ' +
    'Not failing on a registry outage; re-run once it recovers.';
  console.log(`::warning title=Security audit skipped (registry unreachable)::${msg}`);
  summary(`### :warning: Security audit skipped\n\n${msg}`);
  process.exit(3);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function prCheck(base: string): void {
  const touched = changedFiles(base).some((f) => MANIFEST_PATTERN.test(f));
  const head = runAudit('.');
  if (!head) unreachable();

  let added = head;
  if (!touched) {
    added = [];
  } else {
    const before = auditRef(base);
    if (!before) unreachable();
    added = diffAdvisories(before, head).added;
  }
  const existing = head.filter((a) => !added.some((b) => b.id === a.id));

  for (const a of existing) {
    console.log(
      `::warning title=Existing advisory ${a.id} (${a.module})::Already on the base branch; the daily security-autofix job handles it. ${a.url}`,
    );
  }
  if (added.length === 0) {
    console.log(
      `No high/critical advisories added by this PR (${existing.length} already on base).`,
    );
    return;
  }
  for (const a of added) {
    console.log(`::error title=New advisory ${a.id} (${a.module})::${a.title} ${a.url}`);
  }
  summary(`### Advisories this PR introduces\n\n${added.map(line).join('\n')}`);
  process.exit(1);
}

function gate(base: string, beforeFile: string, afterFile: string): void {
  const before = JSON.parse(readFileSync(beforeFile, 'utf8')) as Advisory[];
  const after = JSON.parse(readFileSync(afterFile, 'utf8')) as Advisory[];
  const files = changedFiles(base);

  const lockJumps = files.includes('pnpm-lock.yaml')
    ? majorJumps(
        parseLockVersions(git('show', `${base}:pnpm-lock.yaml`)),
        parseLockVersions(readFileSync('pnpm-lock.yaml', 'utf8')),
      )
    : [];
  const directJumps = files
    .filter((f) => f.endsWith('package.json'))
    .flatMap((f) => directDependencyJumps(git('show', `${base}:${f}`), readFileSync(f, 'utf8')));

  const verdict = evaluateGate({ changedFiles: files, before, after, lockJumps, directJumps });
  const { fixed, remaining } = diffAdvisories(before, after);

  const body = [
    'Opened by the daily **security-autofix** workflow.',
    '',
    `### Fixed (${fixed.length})`,
    fixed.map(line).join('\n') || '_none_',
    '',
    `### Still open (${remaining.length})`,
    remaining.map(line).join('\n') || '_none_',
    '',
    '### Auto-merge',
    verdict.automerge
      ? 'Eligible: dependency manifests only, no major version jumps, no new advisories. Merges itself once every check passes.'
      : `**Needs review**, because:\n${verdict.reasons.map((r) => `- ${r}`).join('\n')}`,
  ].join('\n');

  console.log(body);
  output('automerge', String(verdict.automerge));
  output('fixed_count', String(fixed.length));
  output('body', body);
}

async function main(): Promise<void> {
  const [cmd] = process.argv.slice(2);
  if (cmd === 'recheck-accepted') return recheckAccepted();
  if (cmd === 'audit') {
    const advisories = runAudit(arg('dir') ?? '.');
    if (!advisories) unreachable();
    const json = JSON.stringify(advisories, null, 2);
    const out = arg('out');
    if (out) writeFileSync(out, `${json}\n`);
    console.log(json);
    output('count', String(advisories.length));
    output('modules', [...new Set(advisories.map((a) => a.module))].join(' '));
    return;
  }
  if (cmd === 'pr-check') return prCheck(arg('base') ?? 'origin/main');
  if (cmd === 'gate') {
    const before = arg('before');
    const after = arg('after');
    if (!before || !after) throw new Error('gate needs --before and --after');
    return gate(arg('base') ?? 'origin/main', before, after);
  }
  console.error('Usage: security-autofix.ts audit|pr-check|gate|recheck-accepted [options]');
  process.exit(2);
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
