/**
 * Old issue numbers must turn into either the recreated issue's new number or
 * an explicit `legacy #N` — never silently into a different issue, and never
 * half converted.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  linesUnchangedSince,
  parseBoundaryLines,
  renderTable,
  rewriteLine,
  type LegacyMap,
} from './rewrite-legacy-issue-refs';

const map: LegacyMap = {
  newRepo: 'Maple-and-Spruce/maple-and-spruce',
  items: {
    '164': { kind: 'issue', state: 'open', title: 'Registration', newNumber: 12 },
    '333': { kind: 'issue', state: 'closed', title: 'Old bug' },
    '725': { kind: 'pr', state: 'merged', title: 'Batch deploy' },
    '798': { kind: 'issue', state: 'closed', title: 'Billing' },
    '900': { kind: 'issue', state: 'open', title: 'Not moved yet', pending: true },
  },
};

describe('rewriting a line', () => {
  it.each([
    ['a recreated issue gets its new number', 'see #164 for why', 'see #12 for why'],
    ['anything else is marked legacy', 'shipped in #798.', 'shipped in legacy #798.'],
    ['a parenthesised ref', "describe('billing (#798)', () => {", "describe('billing (legacy #798)', () => {"],
    ['"PR #N" keeps its noun after "legacy"', 'PR #725 batches it', 'legacy PR #725 batches it'],
    ['"issue #N" likewise', '(issue #798: zero warnings', '(legacy issue #798: zero warnings'],
    [
      'a markdown link to a recreated issue points at the new repo',
      '| [#164](https://github.com/david-shortman/maple-and-spruce/issues/164) |',
      '| [#12](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/12) |',
    ],
    [
      'a markdown link to anything else collapses to text, since the old repo goes away',
      'Epic: [#798](https://github.com/david-shortman/maple-and-spruce/issues/798)',
      'Epic: legacy #798',
    ],
    [
      'a bare URL to an old PR',
      'PR: https://github.com/Maple-and-Spruce/maple-and-spruce/pull/725',
      'PR: legacy #725',
    ],
  ])('%s', (_, input, expected) => {
    expect(rewriteLine(input, map)).toBe(expected);
  });

  it.each([
    ['a CSS colour', 'color: #333;'],
    ['a colour in a quoted string', "background: '#333'"],
    ['an HTML entity', 'it&#333;s'],
    ['a URL fragment', 'see /docs/page#333'],
    ['a number that was never an issue', 'item #4242'],
    ['an already rewritten ref', 'in legacy #798 and legacy PR #725'],
  ])('leaves %s alone', (_, input) => {
    expect(rewriteLine(input, map)).toBe(input);
  });

  it('leaves the whole line alone while any ref in it waits to be recreated', () => {
    const line = 'after #798, see #900';
    expect(rewriteLine(line, map)).toBe(line);
  });
});

describe('which lines count as old', () => {
  const sha = (c: string): string => c.repeat(40);
  const porcelain = [
    `${sha('a')} 1 1 2`,
    'author Someone',
    'boundary',
    'filename f.md',
    'old line one',
    `${sha('a')} 2 2`,
    'old line two',
    `${sha('b')} 3 3 1`,
    'author Someone',
    'filename f.md',
    'new line',
    `${sha('a')} 4 4 1`,
    'old line again',
  ]
    .map((l) => (l.match(/^[0-9a-f]{40} /) ? l : `\t${l}`.replace(/^\t(author|boundary|filename)/, '$1')))
    .join('\n');

  it('returns every line owned by a boundary commit, not just the first', () => {
    expect([...parseBoundaryLines(porcelain)].sort()).toEqual([1, 2, 4]);
  });
});

describe('the lookup table', () => {
  const table = renderTable({
    newRepo: 'Maple-and-Spruce/maple-and-spruce',
    items: {
      '12': { kind: 'pr', state: 'merged', title: 'fix: a | b <tag>' },
      '3': { kind: 'issue', state: 'open', title: 'Moved one', newNumber: 40 },
      '5': { kind: 'issue', state: 'open', title: 'Still moving', pending: true },
    },
  });

  it('lists legacy numbers in order, with where each one went', () => {
    const rows = table.split('\n').filter((l) => /^\| \d/.test(l));
    expect(rows).toEqual([
      '| 3 | issue | open | Moved one | #40 |',
      '| 5 | issue | open | Still moving | moving |',
      '| 12 | PR | merged | fix: a \\| b &lt;tag&gt; |  |',
    ]);
  });
});

describe('which lines count as old, against a real repo', () => {
  // eslint-disable-next-line sonarjs/no-os-command-from-path
  const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd }).toString().trim();

  it('treats a line edited on disk but not committed as new, so a rerun cannot rewrite it twice', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-refs-'));
    git(dir, 'init', '-q');
    git(dir, 'config', 'user.email', 'test@example.com');
    git(dir, 'config', 'user.name', 'Test');
    fs.writeFileSync(path.join(dir, 'f.md'), 'one #1\ntwo #2\nthree #3\n');
    git(dir, 'add', '.');
    git(dir, 'commit', '-qm', 'base');
    const base = git(dir, 'rev-parse', 'HEAD');

    fs.writeFileSync(path.join(dir, 'f.md'), 'one #1\ntwo legacy #2\nthree #3\n');

    expect([...linesUnchangedSince('f.md', base, dir)].sort()).toEqual([1, 3]);
  });
});
