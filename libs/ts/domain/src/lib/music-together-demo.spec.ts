import { describe, it, expect } from 'vitest';
import { mtDemoDisplayLabel } from './music-together-demo';

describe('mtDemoDisplayLabel', () => {
  it('formats the demo time in Eastern Time regardless of runtime timezone', () => {
    // 14:00 UTC on 2026-09-15 = 10:00 AM EDT. On Cloud Functions (UTC runtime)
    // this used to render "2:00 PM"; the label must pin America/New_York.
    const label = mtDemoDisplayLabel({
      dateTime: new Date('2026-09-15T14:00:00Z'),
      location: 'Morgantown Public Library',
    });
    expect(label).toContain('10:00 AM');
    expect(label).not.toContain('2:00 PM');
    expect(label).toContain('Morgantown Public Library');
  });

  it('omits the separator when there is no location', () => {
    const label = mtDemoDisplayLabel({
      dateTime: new Date('2026-09-15T14:00:00Z'),
      location: '',
    });
    expect(label).toContain('10:00 AM');
    expect(label).not.toContain('·');
  });
});
