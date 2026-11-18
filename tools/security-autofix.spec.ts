import { describe, it, expect } from 'vitest';
import {
  Advisory,
  breakingKey,
  compareVersions,
  diffAdvisories,
  directDependencyJumps,
  evaluateAccepted,
  evaluateGate,
  inVulnerableRange,
  majorJumps,
  parseAuditReport,
  parseIgnoredGhsas,
  parseLockVersions,
  toAcceptedAdvisory,
} from './security-autofix';

const adv = (id: string, module = 'pkg'): Advisory => ({
  id,
  module,
  severity: 'high',
  title: `${module} is vulnerable`,
  url: `https://github.com/advisories/${id}`,
  patched: '>=2.0.0',
});

describe('parseAuditReport', () => {
  it('keeps high and critical advisories, deduped by GHSA id', () => {
    const raw = JSON.stringify({
      advisories: {
        '1': { id: 1, github_advisory_id: 'GHSA-a', module_name: 'a', severity: 'high', title: 't', url: 'u', patched_versions: '>=1' },
        '2': { id: 2, github_advisory_id: 'GHSA-a', module_name: 'a', severity: 'high', title: 't', url: 'u', patched_versions: '>=1' },
        '3': { id: 3, github_advisory_id: 'GHSA-b', module_name: 'b', severity: 'critical', title: 't', url: 'u', patched_versions: '>=1' },
        '4': { id: 4, github_advisory_id: 'GHSA-c', module_name: 'c', severity: 'moderate', title: 't', url: 'u', patched_versions: '>=1' },
      },
    });

    expect(parseAuditReport(raw)?.map((a) => a.id)).toEqual(['GHSA-a', 'GHSA-b']);
  });

  it('returns an empty list for a clean report', () => {
    expect(parseAuditReport('{"advisories":{}}')).toEqual([]);
  });

  it('returns null when the registry failed, so an outage never reads as clean', () => {
    expect(parseAuditReport('The operation was aborted due to timeout')).toBeNull();
    expect(parseAuditReport('{"error":"ETIMEDOUT"}')).toBeNull();
  });
});

describe('diffAdvisories', () => {
  it('splits into added, fixed and remaining', () => {
    const d = diffAdvisories([adv('A'), adv('B')], [adv('B'), adv('C')]);

    expect(d.added.map((a) => a.id)).toEqual(['C']);
    expect(d.fixed.map((a) => a.id)).toEqual(['A']);
    expect(d.remaining.map((a) => a.id)).toEqual(['B']);
  });
});

describe('parseLockVersions', () => {
  it('reads plain and scoped keys from the packages section only', () => {
    const lock = [
      "lockfileVersion: '9.0'",
      'importers:',
      '  .:',
      '    dependencies:',
      '      follow-redirects@9.9.9:',
      'packages:',
      '  follow-redirects@1.16.2:',
      "  '@scope/thing@2.0.1':",
      '    resolution: {integrity: sha512-x}',
      '  debug@4.4.3(supports-color@8.1.1):',
      'snapshots:',
      '  other@1.0.0:',
    ].join('\n');

    const v = parseLockVersions(lock);

    expect([...v.get('follow-redirects')!]).toEqual(['1.16.2']);
    expect([...v.get('@scope/thing')!]).toEqual(['2.0.1']);
    expect([...v.get('debug')!]).toEqual(['4.4.3']);
    expect(v.has('other')).toBe(false);
  });
});

describe('breakingKey', () => {
  it('is the major, or major.minor below 1.0', () => {
    expect(breakingKey('^7.29.7')).toBe('7');
    expect(breakingKey('0.4.1')).toBe('0.4');
    expect(breakingKey('~0.4')).toBe('0.4');
    expect(breakingKey('workspace:*')).toBeNull();
  });
});

describe('majorJumps', () => {
  const m = (entries: Record<string, string[]>) =>
    new Map(Object.entries(entries).map(([k, v]) => [k, new Set(v)]));

  it('ignores patch and minor moves', () => {
    expect(majorJumps(m({ a: ['1.16.1'] }), m({ a: ['1.16.2'] }))).toEqual([]);
  });

  it('flags a transitive major jump', () => {
    expect(majorJumps(m({ a: ['1.9.0'] }), m({ a: ['2.0.0'] }))).toEqual([
      { name: 'a', from: '1.9.0', to: '2.0.0' },
    ]);
  });

  it('flags a 0.x minor move as breaking', () => {
    expect(majorJumps(m({ a: ['0.4.1'] }), m({ a: ['0.5.0'] }))).toHaveLength(1);
  });

  it('does not count a package that already had a copy at that major', () => {
    expect(majorJumps(m({ a: ['1.0.0', '2.0.0'] }), m({ a: ['2.1.0'] }))).toEqual([]);
  });

  it('ignores newly added packages', () => {
    expect(majorJumps(m({}), m({ a: ['3.0.0'] }))).toEqual([]);
  });
});

describe('directDependencyJumps', () => {
  it('flags only major moves of existing direct deps', () => {
    const before = JSON.stringify({ dependencies: { a: '^1.2.0', b: '^4.0.0' } });
    const after = JSON.stringify({ dependencies: { a: '^1.9.0', b: '^5.0.0', c: '^9.0.0' } });

    expect(directDependencyJumps(before, after)).toEqual([
      { name: 'b', from: '^4.0.0', to: '^5.0.0' },
    ]);
  });
});

describe('evaluateGate', () => {
  const clean = {
    changedFiles: ['pnpm-lock.yaml'],
    before: [adv('A')],
    after: [],
    lockJumps: [],
    directJumps: [],
  };

  it('auto-merges a lockfile-only fix with no major jumps', () => {
    expect(evaluateGate(clean)).toEqual({ automerge: true, reasons: [] });
  });

  it('allows overrides and nested manifests', () => {
    const v = evaluateGate({
      ...clean,
      changedFiles: ['pnpm-workspace.yaml', 'pnpm-lock.yaml', 'apps/maple-spruce/package.json'],
    });
    expect(v.automerge).toBe(true);
  });

  it('refuses when anything but a manifest changed', () => {
    const v = evaluateGate({ ...clean, changedFiles: ['pnpm-lock.yaml', 'tools/x.ts'] });
    expect(v.automerge).toBe(false);
    expect(v.reasons.join()).toContain('tools/x.ts');
  });

  it('refuses when it fixes nothing', () => {
    expect(evaluateGate({ ...clean, after: [adv('A')] }).automerge).toBe(false);
  });

  it('refuses when it introduces an advisory', () => {
    const v = evaluateGate({ ...clean, after: [adv('Z')] });
    expect(v.automerge).toBe(false);
    expect(v.reasons.join()).toContain('Z');
  });

  it('refuses a major jump, direct or transitive', () => {
    const jump = { name: 'x', from: '1.0.0', to: '2.0.0' };
    expect(evaluateGate({ ...clean, lockJumps: [jump] }).automerge).toBe(false);
    expect(evaluateGate({ ...clean, directJumps: [jump] }).automerge).toBe(false);
  });
});

describe('parseIgnoredGhsas', () => {
  it('reads the ids and skips the comments between them', () => {
    const yaml = [
      'packages:',
      "  - 'apps/*'",
      'auditConfig:',
      '  ignoreGhsas:',
      '    # why the first one is accepted',
      '    - GHSA-aaaa-bbbb-cccc',
      '',
      '    # why the second one is accepted,',
      '    # over two lines',
      "    - 'GHSA-dddd-eeee-ffff'",
      '',
      'overrides:',
      '  - GHSA-not-in-the-list',
    ].join('\n');

    expect(parseIgnoredGhsas(yaml)).toEqual(['GHSA-aaaa-bbbb-cccc', 'GHSA-dddd-eeee-ffff']);
  });

  it('is empty when nothing is accepted', () => {
    expect(parseIgnoredGhsas("packages:\n  - 'apps/*'\n")).toEqual([]);
  });
});

describe('compareVersions', () => {
  it('orders numerically, not as text', () => {
    expect(compareVersions('4.0.10', '4.0.9')).toBe(1);
    expect(compareVersions('2.3.2', '4.0.0')).toBe(-1);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });

  it('puts a prerelease below its release', () => {
    expect(compareVersions('4.0.8-beta.1', '4.0.8')).toBe(-1);
  });
});

describe('inVulnerableRange', () => {
  it('handles the comparator forms GitHub writes', () => {
    expect(inVulnerableRange('4.0.7', '<= 4.0.7')).toBe(true);
    expect(inVulnerableRange('4.0.8', '<= 4.0.7')).toBe(false);
    expect(inVulnerableRange('4.0.4', '>= 4.0.0, < 4.0.8')).toBe(true);
    expect(inVulnerableRange('2.3.2', '>= 4.0.0, < 4.0.8')).toBe(false);
    expect(inVulnerableRange('1.2.3', '= 1.2.3')).toBe(true);
  });

  it('treats a range it cannot read as still affected', () => {
    expect(inVulnerableRange('1.0.0', 'everything')).toBe(true);
  });
});

describe('evaluateAccepted', () => {
  const installed = new Map([
    ['globber', new Set(['2.3.2', '4.0.7'])],
    ['schema', new Set(['3.25.0', '4.6.7'])],
  ]);
  const one = (pkg: string, range: string, firstPatched: string | null) => ({
    withdrawn: false,
    ranges: [{ package: pkg, range, firstPatched }],
  });

  it('keeps waiting while no patched release exists', () => {
    const v = evaluateAccepted('GHSA-x', one('globber', '<= 4.0.7', null), installed);

    expect(v.status).toBe('waiting');
    expect(v.detail).toContain('globber 2.3.2');
    expect(v.detail).toContain('globber 4.0.7');
  });

  it('keeps waiting when the only patch is across a major version', () => {
    const v = evaluateAccepted('GHSA-x', one('schema', '< 4.6.6', '4.6.6'), installed);

    expect(v.status).toBe('waiting');
    expect(v.detail).toContain('schema 3.25.0 (patched only in 4.6.6, a different major)');
  });

  it('is fixable once every affected copy has a patch in its own major', () => {
    const v = evaluateAccepted(
      'GHSA-x',
      {
        withdrawn: false,
        ranges: [
          { package: 'globber', range: '>= 4.0.0, <= 4.0.7', firstPatched: '4.0.8' },
          { package: 'globber', range: '< 2.3.3', firstPatched: '2.3.3' },
        ],
      },
      installed,
    );

    expect(v.status).toBe('fixable');
    expect(v.detail).toContain('globber 4.0.7 -> 4.0.8');
    expect(v.detail).toContain('globber 2.3.2 -> 2.3.3');
  });

  it('is partly fixable when one major line is patched and another is not', () => {
    const v = evaluateAccepted('GHSA-x', one('globber', '<= 4.0.7', '4.0.8'), installed);

    expect(v.status).toBe('partly-fixable');
    expect(v.detail).toContain('globber 4.0.7 -> 4.0.8');
    expect(v.detail).toContain('not for globber 2.3.2');
  });

  it('is stale once nothing installed is affected', () => {
    expect(evaluateAccepted('GHSA-x', one('globber', '< 2.0.0', null), installed).status).toBe('stale');
    expect(evaluateAccepted('GHSA-x', one('gone', '< 9.0.0', null), installed).status).toBe('stale');
  });

  it('is stale when the advisory was withdrawn', () => {
    const v = evaluateAccepted(
      'GHSA-x',
      { ...one('globber', '<= 4.0.7', null), withdrawn: true },
      installed,
    );

    expect(v.status).toBe('stale');
  });
});

describe('toAcceptedAdvisory', () => {
  it('keeps npm entries and reads the fields the API really returns', () => {
    const a = toAcceptedAdvisory({
      withdrawn_at: null,
      vulnerabilities: [
        {
          package: { ecosystem: 'npm', name: 'globber' },
          vulnerable_version_range: '<= 4.0.7',
          first_patched_version: null,
        },
        {
          package: { ecosystem: 'pip', name: 'globber' },
          vulnerable_version_range: '< 1.0',
          first_patched_version: '1.0',
        },
      ],
    });

    expect(a).toEqual({
      withdrawn: false,
      ranges: [{ package: 'globber', range: '<= 4.0.7', firstPatched: null }],
    });
  });
});
