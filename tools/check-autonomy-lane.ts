#!/usr/bin/env npx tsx
/**
 * Autonomy lane check: may an agent merge this PR on its own?
 *
 * Merging to main deploys to prod with no approval step, so for an agent an
 * open PR is a draft and a merged PR is something customers or Katie see.
 * Every agent-built PR declares a lane, and this check makes sure the lane is
 * no weaker than what the diff touches (docs/process/pipeline.md → Lanes):
 *
 *   invisible  CI, guards, tests, stories, docs, dev tools. Merge freely.
 *   dark       New behaviour that ships switched off behind a Remote Config
 *              flag. Merge freely; turning the flag on is David's and Katie's.
 *   approval   Money, prices, copy, rules, settings, dependencies, or a change
 *              to something people already use. The agent never merges it.
 *
 * Only PRs labelled `agent-built` are checked. People's PRs pass untouched.
 * An approval-lane PR passes too: being honest about needing a human is the
 * point. `tools/agent-merge.sh` is what refuses to merge it.
 *
 * This is a floor, not the whole gate. It reads paths, not meaning, so the
 * Claude review (claude-review.yml) checks that the flag really hides the
 * change and that "invisible" really changes nothing anyone sees.
 *
 *   npx tsx tools/check-autonomy-lane.ts --base <sha> --labels "a,b" --body-file pr.md
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export type Lane = 'invisible' | 'dark' | 'approval';
export const LANE_ORDER: Lane[] = ['invisible', 'dark', 'approval'];

export const AGENT_LABEL = 'agent-built';

/** Files only David changes: rules, CI, settings, deploy shape, dependencies. */
const PROTECTED: RegExp[] = [
  /^\.github\//,
  /^\.claude\//,
  /^\.githooks\//,
  /^AGENTS\.md$/,
  /^docs\/process\//,
  /^firestore\.rules$/,
  /^storage\.rules$/,
  /^firebase\.json$/,
  /^function-codebases\.json$/,
  /^function-count-baseline\.json$/,
  /^nx\.json$/, // an nx.json edit redeploys every function
  /^tsconfig\.base\.json$/,
  /(^|\/)package\.json$/,
  /^pnpm-(lock|workspace)\.yaml$/,
  /(^|\/)\.env/,
  /^vercel\.(json|ts)$/,
  /^tools\/check-autonomy-lane(\.spec)?\.ts$/,
  /^tools\/agent-merge\.sh$/,
  /^tools\/(claude-pii-guard\.sh|check-no-customer-pii\.ts|pii-claude-review\.sh)$/,
];

/** Money moves through these. Always a human, however small the change. */
const MONEY =
  /(^libs\/firebase\/square\/|^apps\/functions-square|square|billing|charge|invoice|payment|payout|checkout|refund|installment|discount|subscription|record-sale|pos-sale|hope|pricing|price)/i;

/** Test code: never deployed, so a money path in a test is still invisible. */
const TEST_CODE: RegExp[] = [
  /\.(spec|test)\.tsx?$/,
  /\.stories\.tsx?$/,
  /^apps\/[^/]*e2e[^/]*\//,
  /^apps\/functions-integration-tests[^/]*\//,
  /^apps\/registration-test-harness\//,
  /^libs\/firebase\/[^/]+-test-mock-server\//,
  /^libs\/firebase\/integration-test-utils\//,
  /^libs\/react\/storybook-fixtures\//,
];

/** Nobody outside the repo sees these. */
const INVISIBLE: RegExp[] = [
  ...TEST_CODE,
  /^docs\//,
  /^tools\//,
  /\.md$/,
  /^firestore\.indexes\.json$/,
];

export interface ChangedFile {
  path: string;
  /** git name-status letter: A added, M modified, D deleted, R renamed. */
  status: string;
}

export interface FileVerdict {
  path: string;
  lane: Lane;
  reason: string;
}

export function classifyFile(file: ChangedFile): FileVerdict {
  const { path, status } = file;
  if (PROTECTED.some((re) => re.test(path))) {
    return { path, lane: 'approval', reason: 'rules, CI, settings or dependencies' };
  }
  const isTest = TEST_CODE.some((re) => re.test(path));
  if (!isTest && MONEY.test(path)) {
    return { path, lane: 'approval', reason: 'money path' };
  }
  if (INVISIBLE.some((re) => re.test(path))) {
    return { path, lane: 'invisible', reason: 'tests, docs or tooling' };
  }
  if (status.startsWith('D')) {
    return { path, lane: 'approval', reason: 'deletes product code' };
  }
  return {
    path,
    lane: 'dark',
    reason: status.startsWith('A') ? 'new product code' : 'changes product code',
  };
}

export function strongest(lanes: Lane[]): Lane {
  return lanes.reduce<Lane>(
    (acc, l) => (LANE_ORDER.indexOf(l) > LANE_ORDER.indexOf(acc) ? l : acc),
    'invisible',
  );
}

/** `Flag: \`agent_123_week_view\`` in the PR body. */
export function declaredFlag(body: string): string | undefined {
  const m = body.match(/^\s*Flag:\s*`?([a-z][a-z0-9_]{2,})`?\s*$/im);
  return m?.[1];
}

export interface LaneInput {
  labels: string[];
  body: string;
  files: ChangedFile[];
  /** Lines the PR adds, across all files. */
  addedLines: string[];
}

export interface LaneResult {
  ok: boolean;
  checked: boolean;
  declared?: Lane;
  required: Lane;
  problems: string[];
  files: FileVerdict[];
}

export function evaluateLane(input: LaneInput): LaneResult {
  const files = input.files.map(classifyFile);
  const required = strongest(files.map((f) => f.lane));

  if (!input.labels.includes(AGENT_LABEL)) {
    return { ok: true, checked: false, required, problems: [], files };
  }

  const problems: string[] = [];
  const laneLabels = input.labels
    .filter((l) => l.startsWith('lane:'))
    .map((l) => l.slice('lane:'.length));
  const valid = laneLabels.filter((l): l is Lane => (LANE_ORDER as string[]).includes(l));

  if (valid.length !== 1 || laneLabels.length !== 1) {
    problems.push(
      `Needs exactly one lane label (lane:invisible, lane:dark or lane:approval); found ${laneLabels.length ? laneLabels.map((l) => `lane:${l}`).join(', ') : 'none'}.`,
    );
    return { ok: false, checked: true, required, problems, files };
  }
  const declared = valid[0];

  if (LANE_ORDER.indexOf(declared) < LANE_ORDER.indexOf(required)) {
    const offenders = files.filter(
      (f) => LANE_ORDER.indexOf(f.lane) > LANE_ORDER.indexOf(declared),
    );
    problems.push(
      `Labelled lane:${declared}, but the diff needs lane:${required}:\n` +
        offenders.map((f) => `  - ${f.path} (${f.reason})`).join('\n'),
    );
  }

  if (declared === 'dark') {
    const flag = declaredFlag(input.body);
    if (!flag) {
      problems.push(
        'lane:dark needs the flag named in the PR body, on its own line: Flag: `agent_<issue>_<name>`.',
      );
    } else if (!input.addedLines.some((line) => line.includes(flag))) {
      problems.push(`The PR declares flag \`${flag}\`, but no added line reads it.`);
    }
  }

  return { ok: problems.length === 0, checked: true, declared, required, problems, files };
}

function git(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

export function parseNameStatus(out: string): ChangedFile[] {
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('\t');
      // Renames list old then new path; the new path is what ships.
      return { status: parts[0], path: parts[parts.length - 1] };
    });
}

function main(): void {
  const args = process.argv.slice(2);
  const arg = (name: string): string | undefined => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const base = arg('base') ?? 'origin/main';
  const labels = (arg('labels') ?? process.env['PR_LABELS'] ?? '')
    .split(',')
    .map((l) => l.trim())
    .filter(Boolean);
  const bodyFile = arg('body-file');
  const body = bodyFile ? readFileSync(bodyFile, 'utf8') : (process.env['PR_BODY'] ?? '');

  const files = parseNameStatus(git(['diff', '--name-status', `${base}...HEAD`]));
  const addedLines = git(['diff', '-U0', `${base}...HEAD`])
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'));

  const result = evaluateLane({ labels, body, files, addedLines });

  if (!result.checked) {
    console.log(`Not an ${AGENT_LABEL} PR, so no lane is required. (This diff would need lane:${result.required}.)`);
    return;
  }
  console.log(`Declared lane:${result.declared ?? '?'} · diff needs lane:${result.required}`);
  for (const f of result.files) console.log(`  ${f.lane.padEnd(9)} ${f.path} (${f.reason})`);
  if (!result.ok) {
    for (const p of result.problems) console.error(`::error title=Autonomy lane::${p.replace(/\n/g, '%0A')}`);
    process.exit(1);
  }
  console.log('Lane OK.');
}

if (require.main === module) main();
