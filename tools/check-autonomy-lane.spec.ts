import { describe, expect, it } from 'vitest';
import {
  classifyFile,
  declaredFlag,
  evaluateLane,
  parseNameStatus,
  type LaneInput,
} from './check-autonomy-lane';

const m = (path: string) => ({ path, status: 'M' });
const a = (path: string) => ({ path, status: 'A' });

function input(over: Partial<LaneInput>): LaneInput {
  return {
    labels: ['agent-built'],
    body: '',
    files: [],
    addedLines: [],
    ...over,
  };
}

describe('classifyFile', () => {
  it.each([
    ['tools/check-function-count.ts', 'invisible'],
    ['docs/reference/BACKLOG.md', 'invisible'],
    ['libs/react/lessons/src/lib/MyWeek.stories.tsx', 'invisible'],
    [
      'libs/firebase/maple-functions/run-lesson-billing/src/lib/run.spec.ts',
      'invisible',
    ],
    ['apps/functions-integration-tests-class/src/x.spec.ts', 'invisible'],
    [
      'libs/firebase/square-test-mock-server/src/lib/routes/orders.ts',
      'invisible',
    ],
    ['firestore.indexes.json', 'invisible'],
    ['docs/process/retros/2026-11-09.md', 'invisible'],
  ])('%s is %s', (path, lane) => {
    expect(classifyFile(m(path)).lane).toBe(lane);
  });

  it.each([
    '.github/workflows/build-check.yml',
    '.claude/rules/verification.md',
    'docs/process/pipeline.md',
    'AGENTS.md',
    'package.json',
    'pnpm-lock.yaml',
    'nx.json',
    'firestore.rules',
    'function-count-baseline.json',
    'tools/check-autonomy-lane.ts',
    'tools/agent-merge.sh',
  ])('%s is protected', (path) => {
    expect(classifyFile(m(path))).toMatchObject({ lane: 'approval' });
  });

  it.each([
    'libs/firebase/maple-functions/run-lesson-billing/src/lib/run-lesson-billing.ts',
    'libs/firebase/square/src/lib/orders.ts',
    'libs/react/invoices/src/lib/InvoiceList.tsx',
    'libs/firebase/maple-functions/create-registration-checkout-link/src/index.ts',
    'apps/functions-square/src/index.ts',
  ])('%s is a money path', (path) => {
    expect(classifyFile(a(path))).toMatchObject({
      lane: 'approval',
      reason: 'money path',
    });
  });

  it('product code is dark, deleting it needs approval', () => {
    const path = 'libs/react/lessons/src/lib/MyWeek.tsx';
    expect(classifyFile(a(path))).toMatchObject({
      lane: 'dark',
      reason: 'new product code',
    });
    expect(classifyFile(m(path))).toMatchObject({
      lane: 'dark',
      reason: 'changes product code',
    });
    expect(classifyFile({ path, status: 'D' }).lane).toBe('approval');
  });
});

describe('declaredFlag', () => {
  it('reads the flag line with or without backticks', () => {
    expect(declaredFlag('Summary\n\nFlag: `agent_60_week_view`\n')).toBe(
      'agent_60_week_view',
    );
    expect(declaredFlag('flag: agent_60_week_view')).toBe('agent_60_week_view');
    expect(declaredFlag('No flag here')).toBeUndefined();
  });
});

describe('evaluateLane', () => {
  it('skips PRs that are not agent-built', () => {
    const r = evaluateLane(input({ labels: [], files: [m('nx.json')] }));
    expect(r).toMatchObject({ ok: true, checked: false, required: 'approval' });
  });

  it('needs exactly one lane label', () => {
    expect(evaluateLane(input({ files: [m('tools/x.ts')] })).ok).toBe(false);
    expect(
      evaluateLane(
        input({
          labels: ['agent-built', 'lane:invisible', 'lane:dark'],
          files: [m('tools/x.ts')],
        }),
      ).ok,
    ).toBe(false);
    expect(
      evaluateLane(
        input({
          labels: ['agent-built', 'lane:sideways'],
          files: [m('tools/x.ts')],
        }),
      ).ok,
    ).toBe(false);
  });

  it('passes an invisible PR that only touches tooling', () => {
    const r = evaluateLane(
      input({
        labels: ['agent-built', 'lane:invisible'],
        files: [m('tools/x.ts'), m('docs/a.md')],
      }),
    );
    expect(r).toMatchObject({
      ok: true,
      declared: 'invisible',
      required: 'invisible',
    });
  });

  it('fails an invisible PR that touches product code, naming the file', () => {
    const r = evaluateLane(
      input({
        labels: ['agent-built', 'lane:invisible'],
        files: [m('tools/x.ts'), m('libs/react/lessons/src/lib/MyWeek.tsx')],
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toContain('libs/react/lessons/src/lib/MyWeek.tsx');
  });

  it('a dark PR needs a declared flag that the diff reads', () => {
    const files = [m('libs/react/lessons/src/lib/MyWeek.tsx')];
    const labels = ['agent-built', 'lane:dark'];
    expect(evaluateLane(input({ labels, files })).problems[0]).toContain(
      'needs the flag named',
    );
    expect(
      evaluateLane(input({ labels, files, body: 'Flag: `agent_60_week_view`' }))
        .problems[0],
    ).toContain('no added line reads it');
    expect(
      evaluateLane(
        input({
          labels,
          files,
          body: 'Flag: `agent_60_week_view`',
          addedLines: ["+  if (boolean('agent_60_week_view')) {"],
        }),
      ).ok,
    ).toBe(true);
  });

  it('a dark label cannot carry a money change', () => {
    const r = evaluateLane(
      input({
        labels: ['agent-built', 'lane:dark'],
        body: 'Flag: `agent_1_x`',
        addedLines: ["+ boolean('agent_1_x')"],
        files: [m('libs/react/invoices/src/lib/InvoiceList.tsx')],
      }),
    );
    expect(r).toMatchObject({ ok: false, required: 'approval' });
  });

  it('an approval PR passes: saying it needs a human is the honest answer', () => {
    const r = evaluateLane(
      input({
        labels: ['agent-built', 'lane:approval'],
        files: [m('package.json')],
      }),
    );
    expect(r).toMatchObject({ ok: true, declared: 'approval' });
  });
});

describe('parseNameStatus', () => {
  it('keeps the new path of a rename', () => {
    expect(parseNameStatus('M\ta.ts\nR100\told.ts\tnew.ts\n')).toEqual([
      { status: 'M', path: 'a.ts' },
      { status: 'R100', path: 'new.ts' },
    ]);
  });
});
