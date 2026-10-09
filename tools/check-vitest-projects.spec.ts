import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { check, findOrphanSpecs } from './check-vitest-projects';

const DOMAIN_SPEC = 'libs/ts/domain/src/a.spec.ts';
const DATA_SPEC = 'libs/react/data/src/b.spec.tsx';

describe('findOrphanSpecs', () => {
  it('passes when every tracked spec is run by some project', () => {
    const tracked = [DOMAIN_SPEC, 'libs/ts/domain/src/a.ts'];

    expect(findOrphanSpecs(tracked, [DOMAIN_SPEC])).toEqual([]);
  });

  it('reports a spec that no project runs', () => {
    // The silent failure this guards: a lib with specs but no vitest config.
    const tracked = [DATA_SPEC, DOMAIN_SPEC];

    expect(findOrphanSpecs(tracked, [DOMAIN_SPEC])).toEqual([DATA_SPEC]);
  });

  it('ignores integration and e2e specs, which have their own runners', () => {
    const tracked = [
      'apps/functions-integration-tests-artist/src/artist.spec.ts',
      'apps/pos-sandbox-e2e/src/sale.spec.ts',
      'apps/maple-spruce-e2e/src/login.spec.ts',
    ];

    expect(findOrphanSpecs(tracked, [])).toEqual([]);
  });

  it('ignores files that are not specs', () => {
    expect(findOrphanSpecs(['libs/ts/domain/src/a.ts'], [])).toEqual([]);
  });
});

describe('check', () => {
  const root = resolve(__dirname, '..');
  const fakeRepo =
    (tracked: string[], runs: string[]) =>
    (command: string): string =>
      command === 'git'
        ? tracked.join('\n') + '\n'
        : JSON.stringify(runs.map((file) => ({ file: resolve(root, file) })));

  it('passes and counts the specs vitest would run', () => {
    const result = check(fakeRepo([DOMAIN_SPEC], [DOMAIN_SPEC]));

    expect(result).toEqual({
      ok: true,
      message: '✓ All 1 unit spec files belong to a Vitest project.',
    });
  });

  it('fails naming the orphan and how to fix it', () => {
    const result = check(fakeRepo([DATA_SPEC], []));

    expect(result.ok).toBe(false);
    expect(result.message).toContain(DATA_SPEC);
    expect(result.message).toContain('nx g @nx/vitest:configuration');
  });
});
