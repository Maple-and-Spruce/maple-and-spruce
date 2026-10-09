import { describe, it, expect } from 'vitest';
import { findMinInstances } from './check-warm-instances';

describe('findMinInstances', () => {
  it('finds a warm instance set in withOptions', () => {
    const text = [
      "import { Functions } from '@maple/firebase/functions';",
      'export const f = Functions.endpoint',
      '  .withOptions({ minInstances: 1, concurrency: 80 })',
      '  .handle(async () => ({}));',
    ].join('\n');
    expect(findMinInstances('f.ts', text)).toEqual([3]);
  });

  it('finds a shorthand property fed from a variable', () => {
    const text = [
      'const minInstances = 1;',
      'export const f = Functions.endpoint.withOptions({ minInstances });',
    ].join('\n');
    expect(findMinInstances('f.ts', text)).toEqual([1, 2]);
  });

  it('ignores comments and strings that mention it', () => {
    const text = [
      '// No minInstances — the CDN cache absorbs cold starts.',
      '/* minInstances: 1 */',
      "const note = 'minInstances';",
    ].join('\n');
    expect(findMinInstances('f.ts', text)).toEqual([]);
  });
});
