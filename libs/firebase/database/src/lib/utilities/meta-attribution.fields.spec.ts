import { describe, it, expect } from 'vitest';
import { toMetaAttributionFields } from './meta-attribution.fields';

describe('toMetaAttributionFields', () => {
  it('always produces the same five keys', () => {
    // A stable field set is what makes "captured nothing" distinguishable from
    // "document predates the feature" in a later query or backfill.
    expect(Object.keys(toMetaAttributionFields()).sort()).toEqual([
      'clientIp',
      'clientUserAgent',
      'eventSourceUrl',
      'fbc',
      'fbp',
    ]);
  });

  it('normalizes absent, empty, and undefined values to null', () => {
    expect(toMetaAttributionFields({ fbp: '', fbc: undefined })).toEqual({
      fbp: null,
      fbc: null,
      eventSourceUrl: null,
      clientIp: null,
      clientUserAgent: null,
    });
  });

  it('falls back to the existing document, field by field', () => {
    const merged = toMetaAttributionFields(
      { clientIp: '198.51.100.9' },
      { fbc: 'fb.1.1.original', clientIp: '198.51.100.1' }
    );
    expect(merged.fbc).toBe('fb.1.1.original');
    // A freshly observed value wins over the stored one.
    expect(merged.clientIp).toBe('198.51.100.9');
  });
});
