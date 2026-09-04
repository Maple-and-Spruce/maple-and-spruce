import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Behavioural spec for tools/run-security-audit.sh.
 *
 * The script is exercised for real (bash, child process) with a stub standing in
 * for `pnpm`, so the outcomes that matter can be asserted without going near the
 * npm registry:
 *
 *   1. a clean report             -> exit 0, no warning
 *   2. a report with advisories   -> exit non-zero (the guardrail keeps teeth)
 *   3. a swallowed registry error -> retry, then exit 0 WITH a warning annotation
 *
 * (3) is the reason the script exists: `pnpm audit` cannot tell a registry
 * timeout apart from a critical CVE by exit code alone, and a timing-out
 * advisories endpoint was failing unrelated PRs.
 */

const SCRIPT = resolve(__dirname, 'run-security-audit.sh');

/** What pnpm prints when the report arrived and nothing hit the threshold. */
const CLEAN = '0 No known vulnerabilities found';
/** What pnpm prints when --ignore-registry-errors swallows a fetch failure. */
const REGISTRY_ERROR = '0 The operation was aborted due to timeout';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'security-audit-spec-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/**
 * Write a stub `pnpm` whose Nth invocation takes the Nth line of `plan` (the
 * last line repeats forever). Line format: `<exitCode> <stdout text>`.
 */
function writeStub(plan: string[]): string {
  const stub = join(dir, 'pnpm-stub.sh');
  writeFileSync(join(dir, 'plan.txt'), plan.join('\n') + '\n');
  writeFileSync(
    stub,
    `#!/usr/bin/env bash
echo "$*" >> "${join(dir, 'calls.txt')}"

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
  plan: string[],
  env: Record<string, string> = {},
): { status: number | null; output: string; calls: string[]; summary: string } {
  const stub = writeStub(plan);
  const summaryFile = join(dir, 'step-summary.md');
  const result = spawnSync('/bin/bash', [SCRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PNPM_BIN: stub,
      GITHUB_STEP_SUMMARY: summaryFile,
      // Keep the suite fast — the retry *count* is what matters, not the wait.
      AUDIT_BACKOFF_SECONDS: '0',
      ...env,
    },
  });
  const callsFile = join(dir, 'calls.txt');
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    calls: existsSync(callsFile)
      ? readFileSync(callsFile, 'utf8').split('\n').filter(Boolean)
      : [],
    summary: existsSync(summaryFile) ? readFileSync(summaryFile, 'utf8') : '',
  };
}

describe('run-security-audit.sh', () => {
  it('passes on a clean report without retrying or warning', () => {
    const { status, calls, output, summary } = run([CLEAN]);

    expect(status).toBe(0);
    expect(calls).toHaveLength(1);
    expect(output).not.toContain('::warning');
    expect(summary).toBe('');
  });

  it('audits at the high threshold and lets pnpm swallow registry errors', () => {
    const { calls } = run([CLEAN]);

    expect(calls[0]).toContain('audit');
    expect(calls[0]).toContain('--audit-level=high');
    expect(calls[0]).toContain('--ignore-registry-errors');
  });

  it('still fails the build when the report contains advisories', () => {
    // The whole point of --ignore-registry-errors is that it only wraps the
    // FETCH — a report that arrived with a high-severity advisory must fail.
    const { status, calls, output } = run(['1 3 vulnerabilities found. Severity: 3 high']);

    expect(status).toBe(1);
    // Failed for a real reason — no retrying, no warning, no green check.
    expect(calls).toHaveLength(1);
    expect(output).not.toContain('::warning');
  });

  it('passes a sub-threshold report through as a success', () => {
    const { status, output } = run([
      '0 28 vulnerabilities found. Severity: 6 low, 20 moderate',
    ]);

    expect(status).toBe(0);
    expect(output).not.toContain('::warning');
  });

  it('retries a registry error and passes once the report arrives', () => {
    const { status, calls, output, summary } = run([REGISTRY_ERROR, CLEAN]);

    expect(status).toBe(0);
    expect(calls).toHaveLength(2);
    expect(output).not.toContain('::warning');
    expect(summary).toBe('');
  });

  it('warns instead of failing when the registry never answers', () => {
    // A registry outage must not red-X an unrelated PR — but it must not pass
    // silently either, or a green check would mean "audited nothing".
    const { status, calls, output, summary } = run([REGISTRY_ERROR]);

    expect(status).toBe(0);
    expect(calls).toHaveLength(3);
    expect(output).toContain('::warning title=Security audit skipped');
    expect(summary).toContain('Security audit skipped');
  });

  it('honours AUDIT_ATTEMPTS', () => {
    const { status, calls } = run([REGISTRY_ERROR], { AUDIT_ATTEMPTS: '5' });

    expect(status).toBe(0);
    expect(calls).toHaveLength(5);
  });
});
