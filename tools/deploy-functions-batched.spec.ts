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

/**
 * Write a one-line executable stub. Used instead of `/bin/true` / `/bin/false`,
 * which do not exist on macOS (they are in /usr/bin) — referencing them made a
 * test pass for the wrong reason: "command not found" rather than the failure
 * mode under test.
 */
function writeShellStub(name: string, body: string): string {
  const stub = join(dir, name);
  writeFileSync(stub, `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 });
  return `/bin/bash ${stub}`;
}

/** Stub plan line for a clean `firebase deploy`. */
const OK = '0 Deploy complete!';

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

# Record the --token this invocation was handed, so the spec can see the
# refresh happening between attempts.
tok=""
prev=""
for arg in "$@"; do
  if [ "$prev" = "--token" ]; then tok="$arg"; fi
  prev="$arg"
done
echo "$tok" >> "${join(dir, 'tokens.txt')}"

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
  const result = spawnSync('/bin/bash', [SCRIPT, targets, 'maple-and-spruce-dev'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      FIREBASE_DEPLOY_TOKEN: 'stub-token',
      FN_DEPLOY_FIREBASE_CMD: `/bin/bash ${stub}`,
      // Keep the suite fast — the backoff *choice* is asserted via the warning
      // text rather than by wall-clock.
      FN_DEPLOY_BATCH_PAUSE: '0',
      FN_DEPLOY_RETRY_BACKOFF: '0',
      FN_DEPLOY_QUOTA_BACKOFF: '0',
      // Never invoke a real `gcloud` from the suite — it is slow, can prompt,
      // and would make these tests depend on the developer being logged in.
      // Individual specs override this to exercise refresh behaviour.
      FN_DEPLOY_TOKEN_CMD: 'exit 1',
      ...env,
    },
  });
  const callsFile = join(dir, 'calls.txt');
  const calls = existsSync(callsFile)
    ? readFileSync(callsFile, 'utf8').split('\n').filter(Boolean)
    : [];
  const tokensFile = join(dir, 'tokens.txt');
  const tokens = existsSync(tokensFile)
    ? readFileSync(tokensFile, 'utf8').split('\n').filter(Boolean)
    : [];
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    calls,
    tokens,
  };
}

/**
 * Write a stub standing in for `gcloud auth print-access-token`, handing out
 * `token-1`, `token-2`, … one per call — so a spec can tell which attempt used
 * which token.
 */
function writeTokenStub(): string {
  const stub = join(dir, 'token-stub.sh');
  writeFileSync(
    stub,
    `#!/usr/bin/env bash
echo "x" >> "${join(dir, 'token-calls.txt')}"
n=$(wc -l < "${join(dir, 'token-calls.txt')}" | tr -d ' ')
echo "token-$n"
`,
    { mode: 0o755 },
  );
  return stub;
}

function targets(n: number): string {
  return Array.from({ length: n }, (_, i) => `functions:maple-core:fn${i + 1}`).join(',');
}

describe('deploy-functions-batched.sh', () => {
  it('deploys a small list in a single batch and exits 0', () => {
    const { status, calls } = run(targets(3), [OK]);

    expect(status).toBe(0);
    expect(calls).toEqual(['functions:maple-core:fn1,functions:maple-core:fn2,functions:maple-core:fn3']);
  });

  it('splits a large list into batches of at most FN_DEPLOY_BATCH_SIZE', () => {
    const { status, calls } = run(targets(65), [OK], {
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
      OK,
    ]);

    expect(status).toBe(0);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toBe(calls[1]);
    expect(output).toContain('attempt 2/4');
  });

  it('retries when firebase exits 0 but silently dropped functions to a 409', () => {
    const { status, calls } = run(targets(2), [
      '0 Error: unable to queue the operation',
      OK,
    ]);

    expect(status).toBe(0);
    expect(calls).toHaveLength(2);
  });

  it('uses the longer quota backoff when the log shows a quota breach', () => {
    const { status, output } = run(targets(2), [
      '2 Quota exceeded for total allowable CPU per project per region',
      OK,
    ]);

    expect(status).toBe(0);
    expect(output).toContain('hit a quota limit');
    expect(output).not.toContain('or 409 contention');
  });

  it('uses the generic backoff for a non-quota failure', () => {
    const { status, output } = run(targets(2), [
      '1 Error: 503 from storage.googleapis.com',
      OK,
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
    const { status, calls } = run('', [OK]);

    expect(status).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('fails fast when the deploy token is missing', () => {
    const stub = writeStub([OK]);
    const result = spawnSync('/bin/bash', [SCRIPT, targets(1), 'maple-and-spruce-dev'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        FIREBASE_DEPLOY_TOKEN: '',
        FN_DEPLOY_FIREBASE_CMD: `/bin/bash ${stub}`,
      },
    });

    expect(result.status).toBe(2);
    expect(`${result.stdout}${result.stderr}`).toContain('FIREBASE_DEPLOY_TOKEN is not set');
  });

  it('survives the caller having set -e (the bug that broke the old retry loop)', () => {
    const stub = writeStub([
      '2 Error: There was an error deploying functions',
      OK,
    ]);
    // Reproduce GitHub Actions' `bash -e {0}` + the step's `set -o pipefail`.
    const result = spawnSync(
      '/bin/bash',
      ['-e', '-c', `set -o pipefail; /bin/bash ${SCRIPT} "${targets(2)}" maple-and-spruce-dev`],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          FIREBASE_DEPLOY_TOKEN: 'stub-token',
          FN_DEPLOY_FIREBASE_CMD: `/bin/bash ${stub}`,
          FN_DEPLOY_BATCH_PAUSE: '0',
          FN_DEPLOY_RETRY_BACKOFF: '0',
          FN_DEPLOY_QUOTA_BACKOFF: '0',
          // This spec spawns the script directly rather than through run(),
          // so it must stub the token command itself — otherwise it shells out
          // to a real gcloud, which hangs on a runner with no credential.
          FN_DEPLOY_TOKEN_CMD: 'exit 1',
        },
      },
    );

    expect(result.status).toBe(0);
    const calls = readFileSync(join(dir, 'calls.txt'), 'utf8').split('\n').filter(Boolean);
    expect(calls).toHaveLength(2);
  });
  // ── Access-token expiry mid-deploy ──────────────────────────────────────
  //
  // The auth step mints a token that lives one hour and the workflow captures
  // it ONCE. A full maple-core deploy measured 62 minutes, so its last batch
  // authenticated with an expired token and 401'd — and retrying could not
  // help, because all four attempts reused the same dead token.

  const UNAUTHORIZED =
    '1 Error: Request to https://cloudresourcemanager.googleapis.com/v1/projects/x had HTTP Error: 401, Request had invalid authentication credentials.';

  describe('deploy token refresh', () => {
    it('mints a fresh token before every attempt', () => {
      const { status, tokens } = run(targets(3), [OK], {
        FN_DEPLOY_TOKEN_CMD: `/bin/bash ${writeTokenStub()}`,
      });

      expect(status).toBe(0);
      // One deploy, and it used the freshly minted token rather than the
      // one handed in via the environment.
      expect(tokens).toEqual(['token-1']);
    });

    it('gives each batch of a long deploy its own token', () => {
      const { status, tokens } = run(targets(65), [OK], {
        FN_DEPLOY_BATCH_SIZE: '10',
        FN_DEPLOY_TOKEN_CMD: `/bin/bash ${writeTokenStub()}`,
      });

      expect(status).toBe(0);
      // 7 batches, 7 distinct tokens — batch 7 is never asked to reuse the
      // token minted before batch 1 an hour earlier.
      expect(tokens).toHaveLength(7);
      expect(new Set(tokens).size).toBe(7);
      expect(tokens[6]).toBe('token-7');
    });

    it('THE REGRESSION: a 401 recovers on retry with a new token', () => {
      const { status, tokens, calls } = run(targets(3), [UNAUTHORIZED, OK], {
        FN_DEPLOY_TOKEN_CMD: `/bin/bash ${writeTokenStub()}`,
      });

      expect(status).toBe(0);
      expect(calls).toHaveLength(2);
      // The retry did not reuse the token that had just been rejected.
      expect(tokens).toEqual(['token-1', 'token-2']);
    });

    it('refreshes even across a quota backoff, which can straddle expiry', () => {
      const { status, tokens } = run(
        targets(3),
        ['1 Error: Quota exceeded for total allowable CPU', OK],
        { FN_DEPLOY_TOKEN_CMD: `/bin/bash ${writeTokenStub()}` },
      );

      expect(status).toBe(0);
      expect(tokens).toEqual(['token-1', 'token-2']);
    });

    it('falls back to the supplied token when refresh fails', () => {
      // gcloud missing or erroring must never fail a deploy — that would turn
      // a working pipeline into a broken one.
      const { status, tokens, output } = run(targets(3), [OK], {
        FN_DEPLOY_TOKEN_CMD: writeShellStub('gcloud-fails.sh', 'exit 1'),
      });

      expect(status).toBe(0);
      expect(tokens).toEqual(['stub-token']);
      expect(output).toMatch(/token refresh unavailable/i);
    });

    it('falls back when refresh returns empty output', () => {
      const { status, tokens, output } = run(targets(3), [OK], {
        FN_DEPLOY_TOKEN_CMD: writeShellStub('gcloud-empty.sh', 'exit 0'),
      });

      expect(status).toBe(0);
      expect(tokens).toEqual(['stub-token']);
      expect(output).toMatch(/returned nothing/i);
    });

    // `timeout` is coreutils: present on the Linux CI runners, absent from a
    // stock macOS. The bound only exists where the binary does, so the
    // assertion runs only there rather than pretending to be portable.
    const hasTimeout =
      spawnSync('/bin/bash', ['-c', 'command -v timeout'], { encoding: 'utf8' })
        .status === 0;

    it.skipIf(!hasTimeout)(
      'gives up on a hung refresh instead of stalling the deploy',
      () => {
        // A gcloud that never returns would be strictly worse than the expiry
        // this refresh fixes — we already hold a token that may still work.
        const { status, tokens, output } = run(targets(3), [OK], {
          // `exec` so the stub BECOMES the sleep rather than parenting it:
          // a real gcloud is one process, and a grandchild left holding the
          // pipe would keep the command substitution open after the kill —
          // testing the stub's shape rather than the script's behaviour.
          FN_DEPLOY_TOKEN_CMD: writeShellStub('gcloud-hangs.sh', 'exec sleep 30'),
          FN_DEPLOY_TOKEN_TIMEOUT: '1',
        });

        expect(status).toBe(0);
        expect(tokens).toEqual(['stub-token']);
        expect(output).toMatch(/token refresh unavailable/i);
      },
    );

    it('never prints the token', () => {
      const { output } = run(targets(3), [OK], {
        FN_DEPLOY_TOKEN_CMD: `/bin/bash ${writeTokenStub()}`,
      });

      expect(output).not.toContain('token-1');
      expect(output).not.toContain('stub-token');
    });
  });
});
