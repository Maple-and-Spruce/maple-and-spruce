import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Behavioural spec for tools/deploy-functions-batched.sh (#723).
 *
 * The script is exercised for real (bash, child process) with a stub standing
 * in for `firebase`. The stub records every `--only` list it was handed and
 * replays a caller-supplied plan of exit codes + output, which lets us assert
 * batching, retry, and backoff-selection without touching Google Cloud.
 *
 * The important regression here is the retry loop running AT ALL: the previous
 * inline `run:` version was killed by GitHub Actions' `bash -e` before it could
 * read PIPESTATUS, so a non-zero `firebase deploy` never retried once.
 */

const SCRIPT = resolve(__dirname, 'deploy-functions-batched.sh');

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fn-deploy-spec-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/**
 * Write a stub `firebase` whose Nth invocation takes the Nth line of `plan`
 * (the last line repeats forever). Line format: `<exitCode> <stdout text>`.
 */
function writeStub(plan: string[]): string {
  const stub = join(dir, 'firebase-stub.sh');
  writeFileSync(join(dir, 'plan.txt'), plan.join('\n') + '\n');
  writeFileSync(
    stub,
    `#!/usr/bin/env bash
# Record the --only value for this invocation.
only=""
prev=""
for arg in "$@"; do
  if [ "$prev" = "--only" ]; then only="$arg"; fi
  prev="$arg"
done
echo "$only" >> "${join(dir, 'calls.txt')}"

count=$(wc -l < "${join(dir, 'calls.txt')}" | tr -d ' ')
total=$(wc -l < "${join(dir, 'plan.txt')}" | tr -d ' ')
if [ "$count" -gt "$total" ]; then count="$total"; fi
line=$(sed -n "\${count}p" "${join(dir, 'plan.txt')}")

code="\${line%% *}"
message="\${line#* }"
echo "$message"
exit "$code"
`,
    { mode: 0o755 },
  );
  return stub;
}

function run(
  targets: string,
  plan: string[],
  env: Record<string, string> = {},
): { status: number | null; output: string; calls: string[] } {
  const stub = writeStub(plan);
  const result = spawnSync('bash', [SCRIPT, targets, 'maple-and-spruce-dev'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      FIREBASE_DEPLOY_TOKEN: 'stub-token',
      FN_DEPLOY_FIREBASE_CMD: `bash ${stub}`,
      // Keep the suite fast — the backoff *choice* is asserted via the warning
      // text rather than by wall-clock.
      FN_DEPLOY_BATCH_PAUSE: '0',
      FN_DEPLOY_RETRY_BACKOFF: '0',
      FN_DEPLOY_QUOTA_BACKOFF: '0',
      ...env,
    },
  });
  const callsFile = join(dir, 'calls.txt');
  const calls = existsSync(callsFile)
    ? readFileSync(callsFile, 'utf8').split('\n').filter(Boolean)
    : [];
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    calls,
  };
}

function targets(n: number): string {
  return Array.from({ length: n }, (_, i) => `functions:maple-core:fn${i + 1}`).join(',');
}

describe('deploy-functions-batched.sh', () => {
  it('deploys a small list in a single batch and exits 0', () => {
    const { status, calls } = run(targets(3), ['0 Deploy complete!']);

    expect(status).toBe(0);
    expect(calls).toEqual(['functions:maple-core:fn1,functions:maple-core:fn2,functions:maple-core:fn3']);
  });

  it('splits a large list into batches of at most FN_DEPLOY_BATCH_SIZE', () => {
    const { status, calls } = run(targets(65), ['0 Deploy complete!'], {
      FN_DEPLOY_BATCH_SIZE: '10',
    });

    expect(status).toBe(0);
    // 65 targets / 10 per batch = 7 batches, the last one short.
    expect(calls).toHaveLength(7);
    const sizes = calls.map((c) => c.split(',').length);
    expect(sizes).toEqual([10, 10, 10, 10, 10, 10, 5]);
    // Every target deployed exactly once, order preserved.
    expect(calls.join(',').split(',')).toEqual(targets(65).split(','));
  });

  it('retries a batch that exits non-zero, then succeeds', () => {
    // THE regression test for #723: under the old inline `run:` block, `bash -e`
    // aborted the step here and attempt 2 never happened.
    const { status, output, calls } = run(targets(2), [
      '2 Error: There was an error deploying functions',
      '0 Deploy complete!',
    ]);

    expect(status).toBe(0);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toBe(calls[1]);
    expect(output).toContain('attempt 2/4');
  });

  it('retries when firebase exits 0 but silently dropped functions to a 409', () => {
    const { status, calls } = run(targets(2), [
      '0 Error: unable to queue the operation',
      '0 Deploy complete!',
    ]);

    expect(status).toBe(0);
    expect(calls).toHaveLength(2);
  });

  it('uses the longer quota backoff when the log shows a quota breach', () => {
    const { status, output } = run(targets(2), [
      '2 Quota exceeded for total allowable CPU per project per region',
      '0 Deploy complete!',
    ]);

    expect(status).toBe(0);
    expect(output).toContain('hit a quota limit');
    expect(output).not.toContain('or 409 contention');
  });

  it('uses the generic backoff for a non-quota failure', () => {
    const { status, output } = run(targets(2), [
      '1 Error: 503 from storage.googleapis.com',
      '0 Deploy complete!',
    ]);

    expect(status).toBe(0);
    expect(output).toContain('or 409 contention');
    expect(output).not.toContain('hit a quota limit');
  });

  it('fails after exhausting attempts, and does not start later batches', () => {
    const { status, output, calls } = run(targets(20), ['2 Error: nope'], {
      FN_DEPLOY_BATCH_SIZE: '10',
      FN_DEPLOY_MAX_ATTEMPTS: '3',
    });

    expect(status).toBe(1);
    // 3 attempts at batch 1, then give up — batch 2 is never attempted.
    expect(calls).toHaveLength(3);
    expect(new Set(calls).size).toBe(1);
    expect(output).toContain('failed after 3 attempts');
  });

  it('is a no-op (exit 0) when handed an empty target list', () => {
    const { status, calls } = run('', ['0 Deploy complete!']);

    expect(status).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('fails fast when the deploy token is missing', () => {
    const stub = writeStub(['0 Deploy complete!']);
    const result = spawnSync('bash', [SCRIPT, targets(1), 'maple-and-spruce-dev'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        FIREBASE_DEPLOY_TOKEN: '',
        FN_DEPLOY_FIREBASE_CMD: `bash ${stub}`,
      },
    });

    expect(result.status).toBe(2);
    expect(`${result.stdout}${result.stderr}`).toContain('FIREBASE_DEPLOY_TOKEN is not set');
  });

  it('survives the caller having set -e (the bug that broke the old retry loop)', () => {
    const stub = writeStub([
      '2 Error: There was an error deploying functions',
      '0 Deploy complete!',
    ]);
    // Reproduce GitHub Actions' `bash -e {0}` + the step's `set -o pipefail`.
    const result = spawnSync(
      'bash',
      ['-e', '-c', `set -o pipefail; bash ${SCRIPT} "${targets(2)}" maple-and-spruce-dev`],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          FIREBASE_DEPLOY_TOKEN: 'stub-token',
          FN_DEPLOY_FIREBASE_CMD: `bash ${stub}`,
          FN_DEPLOY_BATCH_PAUSE: '0',
          FN_DEPLOY_RETRY_BACKOFF: '0',
          FN_DEPLOY_QUOTA_BACKOFF: '0',
        },
      },
    );

    expect(result.status).toBe(0);
    const calls = readFileSync(join(dir, 'calls.txt'), 'utf8').split('\n').filter(Boolean);
    expect(calls).toHaveLength(2);
  });
});
