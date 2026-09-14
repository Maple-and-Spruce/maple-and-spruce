import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require_ = createRequire(import.meta.url);
const { packByWeight, weightFor, loadWeights, DEFAULT_WEIGHT_SECONDS } =
  require_(join(process.cwd(), 'tools/ci-integration-test-matrix.js'));

const p = (name: string) => `functions-integration-tests-${name}`;

function loadOf(
  suites: string[],
  weights: Record<string, number>
): number {
  return suites.reduce((sum, s) => sum + weightFor(s, weights), 0);
}

describe('weightFor', () => {
  it('reads the measured weight by short suite name', () => {
    expect(weightFor(p('lesson'), { lesson: 138 })).toBe(138);
  });

  it('falls back to a default for an unmeasured suite, rather than zero', () => {
    // Zero would pile every new suite onto one shard — the exact failure this
    // packing exists to prevent.
    expect(weightFor(p('brand-new'), {})).toBe(DEFAULT_WEIGHT_SECONDS);
  });
});

describe('loadWeights', () => {
  it('reads the committed weights file', () => {
    const weights = loadWeights();
    expect(weights['lesson']).toBeGreaterThan(0);
    expect(Object.keys(weights).length).toBeGreaterThan(10);
  });
});

describe('packByWeight', () => {
  it('keeps every suite, exactly once', () => {
    const weights = { a: 10, b: 20, c: 30, d: 40, e: 50 };
    const bins = packByWeight(['a', 'b', 'c', 'd', 'e'].map(p), 2, weights);

    expect(bins.flat().sort()).toEqual(['a', 'b', 'c', 'd', 'e'].map(p).sort());
  });

  it('splits the heavy suites apart instead of stacking them', () => {
    // The shape that broke: four heavy suites landing together because they
    // happened to sort next to each other alphabetically.
    const weights = { aa: 100, ab: 100, zy: 1, zz: 1 };
    const bins = packByWeight(['aa', 'ab', 'zy', 'zz'].map(p), 2, weights);

    for (const bin of bins) {
      const heavy = bin.filter((s) => loadOf([s], weights) === 100);
      expect(heavy).toHaveLength(1);
    }
  });

  it('holds the spread between the heaviest and lightest shard tight', () => {
    const weights = loadWeights();
    const suites = Object.keys(weights).map(p);
    const bins = packByWeight(suites, 4, weights);

    const loads = bins.map((b) => loadOf(b, weights));
    const heaviest = Math.max(...loads);
    const lightest = Math.min(...loads);

    // Count-based chunking produced 159s vs 333s — a 2.1x spread, and the
    // heavy shard's last suite timed out (#868). Anything under 1.25x means no
    // shard is carrying enough extra to starve its emulator.
    expect(heaviest / lightest).toBeLessThan(1.25);
  });

  it('beats count-based chunking on the critical path', () => {
    const weights = loadWeights();
    const suites = Object.keys(weights).sort().map(p);

    const chunked: string[][] = [];
    for (let i = 0; i < suites.length; i += 5) chunked.push(suites.slice(i, i + 5));
    const chunkedMax = Math.max(...chunked.map((b) => loadOf(b, weights)));

    const packedMax = Math.max(
      ...packByWeight(suites, chunked.length, weights).map((b) =>
        loadOf(b, weights)
      )
    );

    expect(packedMax).toBeLessThan(chunkedMax);
  });

  it('is deterministic, so one run’s shards can be compared with the next', () => {
    const weights = loadWeights();
    const suites = Object.keys(weights).map(p);

    const first = packByWeight(suites, 4, weights);
    const second = packByWeight(suites.slice().reverse(), 4, weights);

    expect(second).toEqual(first);
  });

  it('drops empty shards rather than emitting a job with nothing to run', () => {
    const bins = packByWeight([p('only')], 4, { only: 10 });
    expect(bins).toHaveLength(1);
  });
});
