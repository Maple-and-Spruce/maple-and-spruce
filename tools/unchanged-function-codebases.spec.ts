import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Behavioural spec for tools/unchanged-function-codebases.sh.
 *
 * Each case builds a throwaway git repo with two commits (base, HEAD) and a stub
 * standing in for `nx run <project>:build`, which writes `code/<project>.js` into
 * `dist/apps/<project>/index.cjs`. The script is run for real (bash, real git
 * worktree) against it.
 *
 * The property that matters is one-sided: a codebase may only be reported
 * unchanged when its bundle really is identical. Every doubtful case must come
 * back as "deploy it".
 */

const SCRIPT = resolve(__dirname, 'unchanged-function-codebases.sh');

const MAPPING = {
  codebaseProjects: {
    'maple-core': 'functions',
    'maple-square': 'functions-square',
  },
};

let repo: string;

function git(...args: string[]): string {
  // eslint-disable-next-line sonarjs/no-os-command-from-path
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

function write(path: string, content: string): void {
  const full = join(repo, path);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
}

function commit(message: string): void {
  git('add', '-A');
  git('commit', '-q', '-m', message);
}

/** The stub build: `<cmd> run <project>:build --skip-nx-cache`, run in the checkout. */
function writeBuildStub(): string {
  const stub = join(repo, '..', 'nx-stub.sh');
  writeFileSync(
    stub,
    `#!/usr/bin/env bash
project="\${2%:build}"
[ -f "fail-$project" ] && exit 1
mkdir -p "dist/apps/$project"
cp "code/$project.js" "dist/apps/$project/index.cjs"
`,
    { mode: 0o755 },
  );
  return `/bin/bash ${stub}`;
}

/** Build a project at HEAD, as the workflow's build step does before the script runs. */
function buildHead(project: string): void {
  execFileSync('/bin/bash', [join(repo, '..', 'nx-stub.sh'), 'run', `${project}:build`], {
    cwd: repo,
  });
}

function run(
  codebases: string[],
  base = 'HEAD~1',
): { status: number | null; unchanged: string[]; log: string } {
  const result = spawnSync('/bin/bash', [SCRIPT, base, JSON.stringify(codebases)], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, UNCHANGED_FN_NX_CMD: writeBuildStub() },
  });
  return {
    status: result.status,
    unchanged: JSON.parse(result.stdout),
    log: result.stderr,
  };
}

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), 'unchanged-fn-spec-'));
  repo = join(root, 'repo');
  mkdirSync(repo);
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'spec@example.com');
  git('config', 'user.name', 'Spec');
  write('function-codebases.json', JSON.stringify(MAPPING));
  write('.gitignore', 'dist/\n');
  write('.env.prod', 'A=1\n');
  write('code/functions.js', 'core v1\n');
  write('code/functions-square.js', 'square v1\n');
  write('libs/shared/types.ts', 'export type A = string;\n');
  commit('base');
  writeBuildStub();
});

afterEach(() => {
  rmSync(join(repo, '..'), { recursive: true, force: true });
});

describe('unchanged-function-codebases.sh', () => {
  it('reports a codebase whose bundle is identical, and not one whose bundle changed', () => {
    write('code/functions.js', 'core v2\n');
    commit('change core only');
    buildHead('functions');
    buildHead('functions-square');

    const { status, unchanged } = run(['maple-core', 'maple-square']);

    expect(status).toBe(0);
    expect(unchanged).toEqual(['maple-square']);
  });

  it('skips everything when the change never reached a bundle', () => {
    // The everyday case: nx marks every importer of a shared lib affected for a
    // type-only edit, and the bundles come out byte-identical.
    write('libs/shared/types.ts', 'export type A = string | number;\n');
    commit('type-only change');
    buildHead('functions');
    buildHead('functions-square');

    expect(run(['maple-core', 'maple-square']).unchanged).toEqual(['maple-core', 'maple-square']);
  });

  it('ignores type declarations and the generated lockfile when comparing', () => {
    write('libs/shared/types.ts', 'export type A = number;\n');
    commit('type-only change');
    buildHead('functions');
    write('dist/apps/functions/src/index.d.ts', 'export declare const x: number;\n');
    write('dist/apps/functions/pnpm-lock.yaml', 'lockfileVersion: 9\n');

    expect(run(['maple-core']).unchanged).toEqual(['maple-core']);
  });

  it('treats an extra runtime file as a change', () => {
    write('libs/shared/types.ts', 'export type A = number;\n');
    commit('type-only change');
    buildHead('functions');
    write('dist/apps/functions/extra.js', 'new\n');

    expect(run(['maple-core']).unchanged).toEqual([]);
  });

  it('skips nothing when a deploy input outside the bundle changed', () => {
    // Env files are copied in at deploy time, so an identical bundle can still
    // deploy different config.
    write('.env.prod', 'A=2\n');
    commit('env change');
    buildHead('functions');

    const { unchanged, log } = run(['maple-core']);

    expect(unchanged).toEqual([]);
    expect(log).toContain('.env.prod');
  });

  it('deploys a codebase whose base build fails', () => {
    write('libs/shared/types.ts', 'export type A = number;\n');
    commit('type-only change');
    buildHead('functions');
    buildHead('functions-square');
    // A base commit carrying the stub's failure marker, so only the base build fails.
    git('checkout', '-q', 'HEAD~1');
    write('fail-functions-square', '');
    commit('base with failing square build');
    const base = git('rev-parse', 'HEAD');
    git('checkout', '-q', 'main');

    const { unchanged, log } = run(['maple-core', 'maple-square'], base);

    expect(unchanged).toEqual(['maple-core']);
    expect(log).toContain('maple-square: base build failed');
  });

  it('deploys a codebase that has no HEAD build to compare', () => {
    write('libs/shared/types.ts', 'export type A = number;\n');
    commit('type-only change');

    expect(run(['maple-core']).unchanged).toEqual([]);
  });

  it('skips nothing when the base commit is not available', () => {
    buildHead('functions');

    const { status, unchanged } = run(['maple-core'], 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef');

    expect(status).toBe(0);
    expect(unchanged).toEqual([]);
  });

  it('leaves no worktree behind', () => {
    write('libs/shared/types.ts', 'export type A = number;\n');
    commit('type-only change');
    buildHead('functions');

    run(['maple-core']);

    expect(git('worktree', 'list').split('\n')).toHaveLength(1);
  });
});
